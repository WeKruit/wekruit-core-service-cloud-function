import cors from 'cors';
import express from 'express';
import * as logger from 'firebase-functions/logger';
import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';

import { getCoreFirestore } from '../../../../bootstrap/firebase';
import { matchingSecrets } from '../../../../bootstrap/secrets';
import { matchingCollections } from '../../../../shared/firestore/collections';
import { sendJson } from '../../../../shared/http/json';
import {
  getMatchingLegacyApiKey,
  getMatchingOpenAiApiKey,
  getMatchingRuntimeConfig,
} from '../../application/runtime';
import {
  syncMatchingJobs,
  type MatchingJobBatchPayload,
  type MatchingJobSyncDependencies,
} from '../../application/jobSync';
import { recordMatchingFeedback, removeSavedMatchingJob, saveMatchingJob } from '../../application/feedback';
import { getJobBoardPage, getJobDetail } from '../../application/jobBoard';
import {
  getMatchingResults,
  getMatchingResultsForProfile,
  type MatchingServiceDependencies,
} from '../../application/matching';
import { WEIGHTS } from '../../application/scoring';
import type { PlatformUserRecord } from '../../domain/platformUser';
import {
  isValidWebhookAuth,
  syncPlatformUserFromWebhook,
  type MatchingWebhookPayload,
  type PlatformUserSyncDependencies,
} from '../../application/userSync';
import { MatchingEmbeddingService } from '../../integrations/openai';
import { MatchingSupabaseService } from '../../integrations/supabase';
import { MatchingFeedbackRepository } from '../../repositories/matchingFeedbackRepository';
import { MatchingJobRepository } from '../../repositories/matchingJobRepository';
import { MatchingSavedJobRepository } from '../../repositories/matchingSavedJobRepository';
import { PlatformUserRepository } from '../../repositories/platformUserRepository';

const DEFAULT_LEGACY_MATCHING_BASE_URL = 'https://matching.wekruit.com';
const DEFAULT_JOBX_TOP_K = 100;
const LEGACY_STATS_SOURCE_REPOS = [
  'Summer2026-Internships',
  'jobright-intern',
  'New-Grad-Positions',
  'jobright-newgrad',
] as const;
const LEGACY_STATS_STATUSES = ['active', 'inactive'] as const;

type LegacyProxyFetch = typeof fetch;

const matchingWebhookSchema = z.object({
  type: z.enum(['INSERT', 'UPDATE']),
  table: z.string().min(1),
  schema: z.string().min(1),
  record: z.record(z.string(), z.unknown()),
  old_record: z.record(z.string(), z.unknown()).nullable().optional(),
});

const matchingJobSchema = z
  .object({
    job_id: z.string().min(1),
    status: z.enum(['active', 'inactive']),
    content_hash: z.string().min(1),
    // v1.6 canonical-vocab fields (D1 / D2). Optional — scraper does not
    // emit them today; the wekruit-pa enrichment trigger fills them
    // server-side. Declared here so the type surface stays honest if/when
    // the macmini sync starts forwarding canonical tags inline.
    role_function: z.array(z.string()).optional(),
    industry_sector: z.array(z.string()).optional(),
  })
  .passthrough();

const matchingJobBatchSchema = z.object({
  collection: z.literal('matching-jobs'),
  mode: z.enum(['incremental', 'full']),
  jobs: z.array(matchingJobSchema).min(1).max(500),
});

const matchRequestSchema = z.object({
  userId: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(30),
});

const legacyMatchRequestSchema = z.object({
  user_id: z.string().min(1),
  desired_titles: z.array(z.string()).optional(),
  job_type: z.enum(['intern', 'new_grad', 'any']).optional(),
  company_size_pref: z.string().optional(),
  industries: z.array(z.string()).optional(),
  location_prefs: z.array(z.string()).optional(),
  sponsorship_needed: z.boolean().optional(),
  skills: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

const feedbackRequestSchema = z.object({
  userId: z.string().min(1),
  jobId: z.string().min(1),
  reaction: z.enum(['like', 'dislike', 'applied']),
});

const legacyFeedbackRequestSchema = z.object({
  user_id: z.string().min(1),
  job_id: z.string().min(1),
  reaction: z.enum(['like', 'dislike', 'applied']),
});

const savedJobRequestSchema = z.object({
  userId: z.string().min(1),
  jobId: z.string().min(1),
});

const legacyJobxCandidateSchema = z
  .object({
    id: z.string().optional(),
    summary: z.string().optional(),
    skills: z
      .array(z.union([z.string(), z.object({ name: z.string() }).passthrough()]))
      .default([]),
    workAuthorization: z.string().optional(),
    totalYearsExperience: z.number().optional(),
    education: z.array(z.record(z.string(), z.unknown())).default([]),
    workHistory: z.array(z.record(z.string(), z.unknown())).default([]),
    domain: z.string().optional(),
    seniority: z.string().optional(),
  })
  .passthrough();

const legacyJobxRequestSchema = z.object({
  candidate: legacyJobxCandidateSchema,
  top_n: z.number().int().min(1).max(100).default(20),
  min_cosine_score: z.number().min(0).max(1).default(0.3),
  excludeJobIds: z.array(z.string()).default([]),
  preferredCountryCode: z.string().optional(),
  top_k: z.number().int().min(1).max(500).default(DEFAULT_JOBX_TOP_K),
  enable_llm_rerank: z.boolean().optional(),
});

const legacyAnalyzeUrlRequestSchema = z.object({
  url: z.string().min(1),
  user_skills: z.array(z.string()).default([]),
});

const jobBoardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  industry: z.string().optional(),
  location: z.string().optional(),
  keyword: z.string().optional(),
  skills: z.string().optional(),
  seniorityLevel: z.string().optional(),
  sponsorship: z.enum(['true', 'false']).optional(),
  salaryMin: z.coerce.number().optional(),
  salaryMax: z.coerce.number().optional(),
});

export interface MatchingApiOverrides {
  syncApiKey?: string;
  userSyncDependencies?: Partial<PlatformUserSyncDependencies>;
  jobSyncDependencies?: Partial<MatchingJobSyncDependencies>;
  matchingDependencies?: Partial<MatchingServiceDependencies>;
  feedbackDependencies?: {
    jobs?: MatchingJobRepository;
    feedback?: MatchingFeedbackRepository;
    savedJobs?: MatchingSavedJobRepository;
    now?: () => Date;
  };
  jobBoardDependencies?: {
    jobs?: MatchingJobRepository;
  };
  legacyProxyDependencies?: {
    fetch?: LegacyProxyFetch;
    baseUrl?: string;
    apiKey?: string;
  };
}

function resolveSyncApiKey(overrides: MatchingApiOverrides) {
  return overrides.syncApiKey ?? getMatchingRuntimeConfig().syncApiKey;
}

function resolveUserSyncDependencies(
  overrides: MatchingApiOverrides,
): { syncApiKey: string; userSyncDependencies: PlatformUserSyncDependencies } {
  const source = overrides.userSyncDependencies?.source;
  const repository = overrides.userSyncDependencies?.repository;
  const requestLogger = overrides.userSyncDependencies?.logger;
  const needsRuntimeConfig = !overrides.syncApiKey || !source;
  const config = needsRuntimeConfig ? getMatchingRuntimeConfig() : null;

  return {
    syncApiKey: overrides.syncApiKey ?? config!.syncApiKey,
    userSyncDependencies: {
      source: source ?? new MatchingSupabaseService(config!),
      repository: repository ?? new PlatformUserRepository(),
      logger: requestLogger ?? logger,
      now: overrides.userSyncDependencies?.now,
    },
  };
}

function resolveJobSyncDependencies(
  overrides: MatchingApiOverrides,
): { syncApiKey: string; jobSyncDependencies: MatchingJobSyncDependencies } {
  return {
    syncApiKey: resolveSyncApiKey(overrides),
    jobSyncDependencies: {
      repository: overrides.jobSyncDependencies?.repository ?? new MatchingJobRepository(),
      logger: overrides.jobSyncDependencies?.logger ?? logger,
      now: overrides.jobSyncDependencies?.now,
    },
  };
}

function resolveMatchingDependencies(overrides: MatchingApiOverrides): MatchingServiceDependencies {
  return {
    jobs: overrides.matchingDependencies?.jobs ?? new MatchingJobRepository(),
    platformUsers: overrides.matchingDependencies?.platformUsers ?? new PlatformUserRepository(),
    feedback: overrides.matchingDependencies?.feedback ?? new MatchingFeedbackRepository(),
    embeddings:
      overrides.matchingDependencies?.embeddings ??
      new MatchingEmbeddingService(getMatchingOpenAiApiKey()),
    now: overrides.matchingDependencies?.now,
  };
}

function resolveFeedbackDependencies(overrides: MatchingApiOverrides) {
  return {
    jobs: overrides.feedbackDependencies?.jobs ?? new MatchingJobRepository(),
    feedback: overrides.feedbackDependencies?.feedback ?? new MatchingFeedbackRepository(),
    savedJobs: overrides.feedbackDependencies?.savedJobs ?? new MatchingSavedJobRepository(),
    now: overrides.feedbackDependencies?.now,
  };
}

function resolveJobBoardDependencies(overrides: MatchingApiOverrides) {
  return {
    jobs: overrides.jobBoardDependencies?.jobs ?? new MatchingJobRepository(),
  };
}

function resolveLegacyProxyDependencies(overrides: MatchingApiOverrides): {
  fetchImpl: LegacyProxyFetch;
  baseUrl: string;
  apiKey: string | null;
} {
  return {
    fetchImpl: overrides.legacyProxyDependencies?.fetch ?? fetch,
    baseUrl: overrides.legacyProxyDependencies?.baseUrl ?? DEFAULT_LEGACY_MATCHING_BASE_URL,
    apiKey: overrides.legacyProxyDependencies?.apiKey ?? (getMatchingLegacyApiKey() || null),
  };
}

function buildDefaultPlatformUser(uid: string): PlatformUserRecord {
  return {
    uid,
    email: '',
    name: 'Legacy Matching User',
    avatarUrl: null,
    location: null,
    status: 'active',
    subscriptionTier: 'free',
    skills: [],
    preferences: {
      targetJobTitles: [],
      jobType: null,
      preferredLocations: [],
      preferredIndustries: [],
      remotePreference: 'any',
      excludedCompanies: [],
      minimumSalary: null,
      salaryRange: null,
      experienceLevel: null,
      companySizePreference: null,
      sponsorshipNeeded: false,
    },
    workAuthorization: null,
    visaSponsorship: null,
    resumeSummary: null,
    totalYearsExperience: null,
    sourcePayloadHash: 'legacy',
    syncedAt: new Date(0).toISOString(),
    source: {
      eventType: 'UPDATE',
      table: 'legacy',
      schema: 'public',
      usersUpdatedAt: null,
      applicationProfileUpdatedAt: null,
      defaultResumeParsedAt: null,
    },
  };
}

function mergeLegacyMatchProfile(
  baseProfile: PlatformUserRecord,
  request: z.infer<typeof legacyMatchRequestSchema>,
): PlatformUserRecord {
  return {
    ...baseProfile,
    skills: request.skills ?? baseProfile.skills,
    preferences: {
      ...baseProfile.preferences,
      targetJobTitles: request.desired_titles ?? baseProfile.preferences.targetJobTitles,
      jobType:
        request.job_type === undefined || request.job_type === 'any'
          ? baseProfile.preferences.jobType
          : request.job_type,
      preferredIndustries: request.industries ?? baseProfile.preferences.preferredIndustries,
      preferredLocations: request.location_prefs ?? baseProfile.preferences.preferredLocations,
      companySizePreference:
        request.company_size_pref === undefined || request.company_size_pref === 'any'
          ? baseProfile.preferences.companySizePreference
          : request.company_size_pref,
      sponsorshipNeeded:
        request.sponsorship_needed ?? baseProfile.preferences.sponsorshipNeeded,
    },
  };
}

function extractCandidateSkills(
  skills: Array<string | { name: string }>,
): string[] {
  return skills
    .map((skill) => (typeof skill === 'string' ? skill : skill.name))
    .map((skill) => skill.trim())
    .filter(Boolean);
}

function inferNeedsSponsorship(workAuthorization: string | undefined) {
  if (!workAuthorization) {
    return false;
  }

  return /(sponsor|visa|f-?1|opt|cpt|h-?1b)/i.test(workAuthorization);
}

function buildJobxProfile(request: z.infer<typeof legacyJobxRequestSchema>): PlatformUserRecord {
  const skills = extractCandidateSkills(request.candidate.skills);
  return {
    ...buildDefaultPlatformUser(request.candidate.id ?? 'jobx-anonymous'),
    skills,
    workAuthorization: request.candidate.workAuthorization ?? null,
    totalYearsExperience: request.candidate.totalYearsExperience ?? null,
    resumeSummary: request.candidate.summary ?? null,
    preferences: {
      ...buildDefaultPlatformUser(request.candidate.id ?? 'jobx-anonymous').preferences,
      sponsorshipNeeded: inferNeedsSponsorship(request.candidate.workAuthorization),
    },
  };
}

function buildLegacySignals(match: Awaited<ReturnType<typeof getMatchingResultsForProfile>>['matches'][number]) {
  const round = (value: number) => Number(value.toFixed(6));
  return {
    title_similarity: round(match.signals.titleSimilarity),
    skills_overlap: round(match.signals.skillsOverlap),
    industry_match: round(match.signals.industryMatch),
    company_size_match: round(match.signals.companySizeMatch),
    location_fit: round(match.signals.locationFit),
    recency: round(match.signals.recency),
    feedback_boost: round(match.signals.feedbackBoost),
  };
}

function buildLegacyMatchResponse(
  match: Awaited<ReturnType<typeof getMatchingResultsForProfile>>['matches'][number],
) {
  return {
    job_id: match.id,
    company_name: match.companyName,
    role_title: match.roleTitle,
    location_raw: match.locationRaw,
    primary_url: match.primaryUrl,
    source_repo: match.sourceRepo,
    industry: match.industry,
    company_size: match.companySize,
    score: Number(match.score.toFixed(6)),
    signals: buildLegacySignals(match),
    matched_skills: match.matchedSkills,
    required_skills: match.requiredSkills,
    date_posted_raw: match.datePostedRaw,
    first_seen_at: match.firstSeenAt,
    sponsorship: match.sponsorship,
    job_description: match.jobDescription,
  };
}

function buildJobxResult(
  match: Awaited<ReturnType<typeof getMatchingResultsForProfile>>['matches'][number],
) {
  return {
    job_id: match.id,
    source: match.companyName,
    title: match.roleTitle ?? '',
    apply_url: match.primaryUrl ?? '',
    locations: [{ display_name: match.locationRaw ?? '', is_primary: true }],
    department: null,
    team: null,
    employment_type: match.jobType === 'intern' ? 'internship' : 'full_time',
    cosine_score: Number(match.signals.titleSimilarity.toFixed(6)),
    skill_overlap_score: Number(match.signals.skillsOverlap.toFixed(6)),
    domain_match_score: Number(match.signals.industryMatch.toFixed(6)),
    seniority_match_score: 0.5,
    experience_gap: 0,
    education_gap: 0,
    penalties: {
      experience_penalty: 0,
      education_penalty: 0,
      total_penalty: 0,
    },
    score_breakdown: {
      cosine_component: Number((match.signals.titleSimilarity * WEIGHTS.titleSimilarity).toFixed(6)),
      skill_component: Number((match.signals.skillsOverlap * WEIGHTS.skillsOverlap).toFixed(6)),
      domain_component: Number((match.signals.industryMatch * WEIGHTS.industryMatch).toFixed(6)),
      seniority_component: 0.05,
    },
    final_score: Number(match.score.toFixed(6)),
    hard_filter: {
      passed: true,
      reasons: [],
    },
    llm_adjusted_score: Number(match.score.toFixed(6)),
    llm_recommendation: null,
    llm_reasons: [],
    llm_gaps: [],
    llm_resume_focus_points: [],
    llm_adjustment: 0,
    llm_enriched: false,
  };
}

async function proxyLegacyJsonRequest(input: {
  overrides: MatchingApiOverrides;
  syncApiKey: string;
  path: string;
  method: 'GET' | 'POST';
  body?: unknown;
}) {
  const { fetchImpl, baseUrl, apiKey } = resolveLegacyProxyDependencies(input.overrides);
  const response = await fetchImpl(`${baseUrl}${input.path}`, {
    method: input.method,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey ?? input.syncApiKey,
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    payload = JSON.parse(text);
  }

  return {
    status: response.status,
    payload,
  };
}

async function getLegacyJobStats() {
  const firestore = getCoreFirestore();
  const collection = firestore.collection(matchingCollections.jobs);
  const stats = await Promise.all(
    LEGACY_STATS_SOURCE_REPOS.flatMap((sourceRepo) =>
      LEGACY_STATS_STATUSES.map(async (status) => {
        const snapshot = await collection
          .where('sourceRepo', '==', sourceRepo)
          .where('status', '==', status)
          .count()
          .get();

        return {
          source_repo: sourceRepo,
          status,
          count: snapshot.data().count,
        };
      }),
    ),
  );

  return stats.filter((entry) => entry.count > 0);
}

export function buildMatchingApiApp(overrides: MatchingApiOverrides = {}) {
  const app = express();
  app.use(cors({ origin: true }));
  app.use(express.json());

  app.get('/', (_req, res) => {
    sendJson(res, 200, {
      status: 'ok',
      service: 'wekruit-matching',
    });
  });

  app.get('/health', (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      service: 'matching',
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/sync/user-changed', async (req, res) => {
    const { syncApiKey, userSyncDependencies } = resolveUserSyncDependencies(overrides);
    const authorizationHeader = req.header('x-webhook-signature');

    if (!isValidWebhookAuth(authorizationHeader, syncApiKey)) {
      sendJson(res, 401, {
        ok: false,
        error: 'Unauthorized',
      });
      return;
    }

    const parsedPayload = matchingWebhookSchema.safeParse(req.body);
    if (!parsedPayload.success) {
      sendJson(res, 400, {
        ok: false,
        error: 'Invalid webhook payload',
      });
      return;
    }

    try {
      const result = await syncPlatformUserFromWebhook(
        parsedPayload.data as MatchingWebhookPayload,
        userSyncDependencies,
      );

      sendJson(res, 200, {
        ok: true,
        status: result.kind,
        uid: result.uid,
        syncedAt: result.syncedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error(
        {
          error: message,
        },
        'Matching user sync request failed',
      );
      sendJson(res, 500, {
        ok: false,
        error: message,
      });
    }
  });

  app.post('/api/sync/jobs', async (req, res) => {
    const { syncApiKey, jobSyncDependencies } = resolveJobSyncDependencies(overrides);
    const requestApiKey = req.header('x-api-key');

    if (requestApiKey !== syncApiKey) {
      sendJson(res, 401, {
        ok: false,
        error: 'Unauthorized',
      });
      return;
    }

    const parsedPayload = matchingJobBatchSchema.safeParse(req.body);
    if (!parsedPayload.success) {
      sendJson(res, 400, {
        ok: false,
        error: 'Invalid job sync payload',
      });
      return;
    }

    try {
      const result = await syncMatchingJobs(
        parsedPayload.data as MatchingJobBatchPayload,
        jobSyncDependencies,
      );

      sendJson(res, 200, {
        ok: true,
        ...result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error(
        {
          error: message,
        },
        'Matching job sync request failed',
      );
      sendJson(res, 500, {
        ok: false,
        error: message,
      });
    }
  });

  app.post('/match', async (req, res) => {
    const syncApiKey = resolveSyncApiKey(overrides);
    const requestApiKey = req.header('x-api-key');
    if (requestApiKey !== syncApiKey) {
      sendJson(res, 401, {
        detail: 'Invalid or missing API key',
      });
      return;
    }

    const parsedBody = legacyMatchRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      sendJson(res, 400, {
        detail: 'Invalid matching request',
      });
      return;
    }

    try {
      const dependencies = resolveMatchingDependencies(overrides);
      const storedProfile = await dependencies.platformUsers.getById(parsedBody.data.user_id);
      const profile = mergeLegacyMatchProfile(
        storedProfile ?? buildDefaultPlatformUser(parsedBody.data.user_id),
        parsedBody.data,
      );
      const feedbackRecords = await dependencies.feedback.listByUser(parsedBody.data.user_id);
      const result = await getMatchingResultsForProfile(
        {
          profile,
          limit: parsedBody.data.limit ?? 30,
          feedbackRecords,
        },
        dependencies,
      );

      sendJson(res, 200, {
        matches: result.matches.map(buildLegacyMatchResponse),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Legacy matching request failed');
      sendJson(res, 500, {
        detail: 'Internal server error',
      });
    }
  });

  app.post('/feedback', async (req, res) => {
    const syncApiKey = resolveSyncApiKey(overrides);
    const requestApiKey = req.header('x-api-key');
    if (requestApiKey !== syncApiKey) {
      sendJson(res, 401, {
        detail: 'Invalid or missing API key',
      });
      return;
    }

    const parsedBody = legacyFeedbackRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      sendJson(res, 400, {
        detail: 'Invalid feedback request',
      });
      return;
    }

    try {
      await recordMatchingFeedback(
        {
          userId: parsedBody.data.user_id,
          jobId: parsedBody.data.job_id,
          reaction: parsedBody.data.reaction,
        },
        resolveFeedbackDependencies(overrides),
      );
      sendJson(res, 200, {
        status: 'ok',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Legacy feedback request failed');
      sendJson(res, 500, {
        detail: 'Internal server error',
      });
    }
  });

  app.post('/api/v1/matching/recommendations', async (req, res) => {
    const syncApiKey = resolveSyncApiKey(overrides);
    const requestApiKey = req.header('x-api-key');
    if (requestApiKey !== syncApiKey) {
      sendJson(res, 401, {
        detail: 'Invalid or missing API key',
      });
      return;
    }

    const parsedBody = legacyJobxRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      sendJson(res, 422, {
        detail: 'Invalid JobX request',
      });
      return;
    }

    try {
      const dependencies = resolveMatchingDependencies(overrides);
      const feedbackRecords = parsedBody.data.candidate.id
        ? await dependencies.feedback.listByUser(parsedBody.data.candidate.id)
        : [];
      const rawResult = await getMatchingResultsForProfile(
        {
          profile: buildJobxProfile(parsedBody.data),
          limit: Math.max(parsedBody.data.top_n * 5, DEFAULT_JOBX_TOP_K),
          feedbackRecords,
          excludeJobIds: parsedBody.data.excludeJobIds,
        },
        dependencies,
      );
      const filteredResults = rawResult.matches
        .filter((match) => match.signals.titleSimilarity >= parsedBody.data.min_cosine_score)
        .slice(0, parsedBody.data.top_n);

      sendJson(res, 200, {
        meta: {
          needs_sponsorship: inferNeedsSponsorship(parsedBody.data.candidate.workAuthorization),
          user_total_years_experience: parsedBody.data.candidate.totalYearsExperience ?? undefined,
          user_degree_rank: 0,
          user_skill_count: extractCandidateSkills(parsedBody.data.candidate.skills).length,
          user_domain: parsedBody.data.candidate.domain ?? 'software_engineering',
          user_seniority: parsedBody.data.candidate.seniority ?? 'entry',
          top_k: parsedBody.data.top_k,
          top_n: parsedBody.data.top_n,
          results_returned: filteredResults.length,
        },
        results: filteredResults.map(buildJobxResult),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Legacy JobX request failed');
      sendJson(res, 500, {
        detail: 'Internal server error',
      });
    }
  });

  app.get('/jobs/stats', async (req, res) => {
    const syncApiKey = resolveSyncApiKey(overrides);
    const requestApiKey = req.header('x-api-key');
    if (requestApiKey !== syncApiKey) {
      sendJson(res, 401, {
        detail: 'Invalid or missing API key',
      });
      return;
    }

    try {
      if (overrides.legacyProxyDependencies) {
        const response = await proxyLegacyJsonRequest({
          overrides,
          syncApiKey,
          path: '/jobs/stats',
          method: 'GET',
        });
        sendJson(res, response.status, (response.payload ?? {}) as Record<string, unknown>);
        return;
      }

      sendJson(res, 200, {
        stats: await getLegacyJobStats(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Legacy jobs stats proxy failed');
      sendJson(res, 502, {
        detail: 'Legacy stats backend unavailable',
      });
    }
  });

  app.post('/analyze-url', async (req, res) => {
    const syncApiKey = resolveSyncApiKey(overrides);
    const requestApiKey = req.header('x-api-key');
    if (requestApiKey !== syncApiKey) {
      sendJson(res, 401, {
        detail: 'Invalid or missing API key',
      });
      return;
    }

    const parsedBody = legacyAnalyzeUrlRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      sendJson(res, 400, {
        detail: 'Invalid analyze-url request',
      });
      return;
    }

    try {
      const response = await proxyLegacyJsonRequest({
        overrides,
        syncApiKey,
        path: '/analyze-url',
        method: 'POST',
        body: parsedBody.data,
      });
      sendJson(res, response.status, (response.payload ?? {}) as Record<string, unknown>);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Legacy analyze-url proxy failed');
      sendJson(res, 502, {
        detail: 'Legacy analyze-url backend unavailable',
      });
    }
  });

  app.post('/api/matching/matches', async (req, res) => {
    const parsedBody = matchRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      sendJson(res, 400, {
        ok: false,
        error: 'Invalid matching request',
      });
      return;
    }

    try {
      const result = await getMatchingResults(parsedBody.data, resolveMatchingDependencies(overrides));
      sendJson(res, 200, {
        ok: true,
        matches: result.matches,
        candidateCount: result.candidateCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Matching match request failed');
      sendJson(res, 500, {
        ok: false,
        error: message,
      });
    }
  });

  app.post('/api/matching/feedback', async (req, res) => {
    const parsedBody = feedbackRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      sendJson(res, 400, {
        ok: false,
        error: 'Invalid feedback request',
      });
      return;
    }

    try {
      const dependencies = resolveFeedbackDependencies(overrides);
      const result = await recordMatchingFeedback(parsedBody.data, dependencies);
      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Matching feedback request failed');
      sendJson(res, 500, {
        ok: false,
        error: message,
      });
    }
  });

  app.post('/api/matching/saved-jobs', async (req, res) => {
    const parsedBody = savedJobRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      sendJson(res, 400, {
        ok: false,
        error: 'Invalid save-job request',
      });
      return;
    }

    try {
      const dependencies = resolveFeedbackDependencies(overrides);
      const result = await saveMatchingJob(parsedBody.data, dependencies);
      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Matching save-job request failed');
      sendJson(res, 500, {
        ok: false,
        error: message,
      });
    }
  });

  app.delete('/api/matching/saved-jobs/:userId/:jobId', async (req, res) => {
    try {
      const result = await removeSavedMatchingJob(
        {
          userId: req.params.userId,
          jobId: req.params.jobId,
        },
        resolveFeedbackDependencies(overrides),
      );
      sendJson(res, 200, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Matching remove-saved-job request failed');
      sendJson(res, 500, {
        ok: false,
        error: message,
      });
    }
  });

  app.get('/api/matching/jobs', async (req, res) => {
    const parsedQuery = jobBoardQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      sendJson(res, 400, {
        ok: false,
        error: 'Invalid job-board query',
      });
      return;
    }

    try {
      const page = await getJobBoardPage(
        {
          limit: parsedQuery.data.limit,
          cursor: parsedQuery.data.cursor ?? null,
          status: parsedQuery.data.status,
          industry: parsedQuery.data.industry ?? null,
          location: parsedQuery.data.location ?? null,
          keyword: parsedQuery.data.keyword ?? null,
          skills: parsedQuery.data.skills
            ? parsedQuery.data.skills.split(',').map((skill) => skill.trim()).filter(Boolean)
            : [],
          seniorityLevel: parsedQuery.data.seniorityLevel ?? null,
          sponsorship:
            parsedQuery.data.sponsorship === undefined
              ? null
              : parsedQuery.data.sponsorship === 'true',
          salaryMin: parsedQuery.data.salaryMin ?? null,
          salaryMax: parsedQuery.data.salaryMax ?? null,
        },
        resolveJobBoardDependencies(overrides),
      );

      sendJson(res, 200, {
        ok: true,
        ...page,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Matching job-board list request failed');
      sendJson(res, 500, {
        ok: false,
        error: message,
      });
    }
  });

  app.get('/api/matching/jobs/:jobId', async (req, res) => {
    try {
      const job = await getJobDetail(req.params.jobId, resolveJobBoardDependencies(overrides));
      if (!job) {
        sendJson(res, 404, {
          ok: false,
          error: 'Job not found',
        });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        job,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      logger.error({ error: message }, 'Matching job detail request failed');
      sendJson(res, 500, {
        ok: false,
        error: message,
      });
    }
  });

  return app;
}

export const matchingApi = onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    memory: '1GiB',
    secrets: matchingSecrets,
    timeoutSeconds: 540,
  },
  buildMatchingApiApp(),
);
