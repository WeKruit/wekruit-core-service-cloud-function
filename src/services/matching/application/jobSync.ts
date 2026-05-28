import type {
  MatchingJobRecord,
  MatchingJobStatus,
  MatchingJobSyncState,
  MatchingJobType,
} from '../domain/job';
import { getLocationBuckets } from './location';
import { buildSearchTokens } from './search';

export interface MatchingJobBatchPayload {
  collection: string;
  mode: 'incremental' | 'full';
  jobs: Array<Record<string, unknown>>;
}

export interface MatchingJobSyncRepository {
  getSyncStates(jobIds: string[]): Promise<Map<string, MatchingJobSyncState>>;
  upsertJobs(jobs: MatchingJobRecord[]): Promise<void>;
}

export interface MatchingJobSyncLogger {
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
}

export interface MatchingJobSyncDependencies {
  repository: MatchingJobSyncRepository;
  logger: MatchingJobSyncLogger;
  now?: () => Date;
}

export interface SyncMatchingJobsResult {
  collection: string;
  mode: 'incremental' | 'full';
  received: number;
  upserted: number;
  skipped: number;
  inactive: number;
  syncedAt: string;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const normalized = normalizeString(item);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

/**
 * Optional variant of `normalizeStringArray`. Returns `undefined` when the
 * inbound payload omits the field entirely, so we don't write empty arrays
 * over canonical tags set by the wekruit-pa side enrichment trigger.
 */
function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = normalizeStringArray(value);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeStringArrayIndex(value: string[]) {
  return [...new Set(value.map((item) => item.toLowerCase()))];
}

function normalizeNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const numbers = value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
  return numbers.length === value.length ? numbers : null;
}

function normalizeBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function inferJobType(sourceRepo: string | null, roleTitle: string | null): MatchingJobType {
  if (!sourceRepo) {
    return 'other';
  }

  // SimplifyJobs (intern/new-grad mirrors)
  if (sourceRepo === 'Summer2026-Internships' || sourceRepo === 'jobright-intern') {
    return 'intern';
  }

  if (sourceRepo === 'New-Grad-Positions' || sourceRepo === 'jobright-newgrad') {
    return 'new_grad';
  }

  // v1.8 — career-ops direct API sources (Phase 73). All full_time unless
  // role title indicates otherwise. Without this, V16 hard-filter
  // `targetJobType=full_time` drops every greenhouse/lever/ashby doc
  // (silent regression for 6500+ jobs).
  if (
    sourceRepo.startsWith('greenhouse:') ||
    sourceRepo.startsWith('lever:') ||
    sourceRepo.startsWith('ashby:') ||
    sourceRepo.startsWith('wellfound:') ||
    sourceRepo.startsWith('linkedin:') ||
    sourceRepo.startsWith('otta:')
  ) {
    const t = (roleTitle ?? '').toLowerCase();
    if (t.includes('intern') || /\bco-?op\b/.test(t)) return 'intern';
    if (t.includes('new grad') || t.includes('new-grad') || t.includes('graduate program')) {
      return 'new_grad';
    }
    if (t.includes('contract')) return 'contract';
    if (t.includes('part-time') || t.includes('part time')) return 'part_time';
    return 'full_time';
  }

  return 'other';
}

function parseSalaryComponent(raw: string) {
  const normalized = raw.replace(/[$,\s]/g, '').toLowerCase();
  if (!normalized) {
    return null;
  }

  const multiplier = normalized.endsWith('m') ? 1_000_000 : normalized.endsWith('k') ? 1_000 : 1;
  const numeric = Number.parseFloat(normalized.replace(/[mk]$/, ''));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.round(numeric * multiplier);
}

function parseSalaryRange(value: string | null): { salaryMin: number | null; salaryMax: number | null } {
  if (!value) {
    return {
      salaryMin: null,
      salaryMax: null,
    };
  }

  const matches = value.match(/\$?\s*\d[\d,]*(?:\.\d+)?\s*[kKmM]?/g) ?? [];
  const numbers = matches.map(parseSalaryComponent).filter((item): item is number => item !== null);
  if (numbers.length === 0) {
    return {
      salaryMin: null,
      salaryMax: null,
    };
  }

  return {
    salaryMin: numbers[0] ?? null,
    salaryMax: numbers[numbers.length - 1] ?? numbers[0] ?? null,
  };
}

function normalizeStatus(value: unknown): MatchingJobStatus {
  if (value === 'active' || value === 'inactive') {
    return value;
  }

  throw new Error('Matching job status must be "active" or "inactive".');
}

/**
 * Builds the Firestore matching-jobs doc from a macmini sync row.
 *
 * Note on tag derivation (v1.8): roleFunction / industrySector /
 * relevantTags / requiredSkills(canonical) are NOT computed here. They are
 * filled async by the wekruit-pa side trigger `paMatchingJobsAutoEnrich`
 * (Firestore onDocumentWritten on matching-jobs/{jobId}) which calls the
 * unified `@pa/job-tag-enricher` LLM service. We do this async because:
 *   1. Sync is HTTP batch up to 50 jobs — calling LLM inline (~3s/job)
 *      would push batch latency past timeout.
 *   2. The trigger is loop-safe via enricherVersion + enricherContentHash
 *      idempotency so re-syncs don't double-enrich.
 *   3. Failed LLM calls don't block the doc landing — recoverable later.
 *
 * What this builder still must get right:
 *   - jobType (used by V16 hard-filter `targetJobType`). Don't default to
 *     "other" silently for career-ops sources or you drop 6500+ jobs.
 *   - sourceRepo, contentHash, embedding, atsApplyUrl: bridge identity.
 *   - locationBuckets: canonical from raw location_raw via getLocationBuckets.
 *   - status: throws if not in {active, inactive}.
 */
export function buildMatchingJobRecord(input: {
  raw: Record<string, unknown>;
  syncedAt: string;
}): MatchingJobRecord {
  const { raw, syncedAt } = input;
  const id = normalizeString(raw.job_id);
  if (!id) {
    throw new Error('Matching job payload is missing "job_id".');
  }

  const contentHash = normalizeString(raw.content_hash);
  if (!contentHash) {
    throw new Error(`Matching job "${id}" is missing "content_hash".`);
  }
  const sourceRepo = normalizeString(raw.source_repo);
  const salaryRange = normalizeString(raw.salary_range);
  const { salaryMin, salaryMax } = parseSalaryRange(salaryRange);

  const roleTitle = normalizeString(raw.role_title);
  // Phase 63 multi-source array. Preserve full attribution
  // (e.g. ['vcboard:a16z']); fall back to [sourceRepo] for older rows.
  const sources =
    normalizeStringArray(raw.sources).length > 0
      ? normalizeStringArray(raw.sources)
      : sourceRepo
        ? [sourceRepo]
        : [];
  // v1.6 canonical-vocab fields (D1 / D2). Scraper does not emit them today
  // (wekruit-pa enrichment trigger fills the Firestore doc post-write). We
  // forward them through only when present so the receiver stays honest:
  // when the macmini sync starts emitting canonical tags inline (W7), this
  // path needs no further change. Absent fields stay `undefined` to avoid
  // clobbering canonical tags written by the enrichment trigger.
  const roleFunction = optionalStringArray(raw.role_function);
  const industrySector = optionalStringArray(raw.industry_sector);
  return {
    id,
    sourceRepo,
    // Phase 63 multi-source array — preserve full attribution
    // (e.g. ['vcboard:a16z']) instead of just the legacy single
    // `sourceRepo`. 2026-05-28: was being dropped, so every Firestore
    // doc had `sources: None`.
    sources,
    jobType: inferJobType(sourceRepo, roleTitle),
    companyName: normalizeString(raw.company_name),
    roleTitle,
    primaryUrl: normalizeString(raw.primary_url),
    atsApplyUrl: normalizeString(raw.ats_apply_url),
    locationRaw: normalizeString(raw.location_raw),
    datePostedRaw: normalizeString(raw.date_posted_raw),
    status: normalizeStatus(raw.status),
    contentHash,
    jobDescription: normalizeString(raw.job_description),
    coreResponsibilities: normalizeStringArray(raw.core_responsibilities),
    salaryRange,
    salaryMin,
    salaryMax,
    seniorityLevel: normalizeString(raw.seniority_level),
    benefits: normalizeStringArray(raw.benefits),
    qualifications: normalizeStringArray(raw.qualifications),
    industry: normalizeString(raw.industry),
    companySize: normalizeString(raw.company_size),
    requiredSkills: normalizeStringArray(raw.required_skills),
    requiredSkillsIndex: normalizeStringArrayIndex(normalizeStringArray(raw.required_skills)),
    locationBuckets: getLocationBuckets(normalizeString(raw.location_raw)),
    searchTokens: buildSearchTokens(
      normalizeString(raw.company_name),
      normalizeString(raw.role_title),
      normalizeString(raw.industry),
    ),
    industryKey: normalizeString(raw.industry)?.toLowerCase() ?? null,
    sponsorship: normalizeBoolean(raw.sponsorship),
    embedding: normalizeNumberArray(raw.embedding),
    embeddingModel: normalizeString(raw.embedding_model),
    firstSeenAt: normalizeString(raw.first_seen_at),
    lastSeenAt: normalizeString(raw.last_seen_at),
    enrichedAt: normalizeString(raw.enriched_at),
    embeddedAt: normalizeString(raw.embedded_at),
    syncedAt,
    ...(roleFunction ? { roleFunction } : {}),
    ...(industrySector ? { industrySector } : {}),
  };
}

export function shouldUpsertMatchingJob(
  existing: MatchingJobSyncState | undefined,
  incoming: MatchingJobRecord,
) {
  if (!existing) {
    return true;
  }

  if (existing.status !== incoming.status) {
    return true;
  }

  if (!existing.hasEmbedding && Array.isArray(incoming.embedding) && incoming.embedding.length > 0) {
    return true;
  }

  return existing.contentHash !== incoming.contentHash;
}

export async function syncMatchingJobs(
  payload: MatchingJobBatchPayload,
  dependencies: MatchingJobSyncDependencies,
): Promise<SyncMatchingJobsResult> {
  const syncedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const incomingJobs = payload.jobs.map((job) =>
    buildMatchingJobRecord({
      raw: job,
      syncedAt,
    }),
  );

  const jobIds = incomingJobs.map((job) => job.id);
  const existingStates = await dependencies.repository.getSyncStates(jobIds);
  const jobsToUpsert = incomingJobs.filter((job) =>
    shouldUpsertMatchingJob(existingStates.get(job.id), job),
  );

  if (jobsToUpsert.length > 0) {
    await dependencies.repository.upsertJobs(jobsToUpsert);
  }

  dependencies.logger.info(
    {
      collection: payload.collection,
      mode: payload.mode,
      received: incomingJobs.length,
      upserted: jobsToUpsert.length,
      skipped: incomingJobs.length - jobsToUpsert.length,
      inactive: incomingJobs.filter((job) => job.status === 'inactive').length,
      syncedAt,
    },
    'Matching job sync completed',
  );

  return {
    collection: payload.collection,
    mode: payload.mode,
    received: incomingJobs.length,
    upserted: jobsToUpsert.length,
    skipped: incomingJobs.length - jobsToUpsert.length,
    inactive: incomingJobs.filter((job) => job.status === 'inactive').length,
    syncedAt,
  };
}
