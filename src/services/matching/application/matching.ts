import type { MatchingFeedbackRecord } from '../domain/feedback';
import type { MatchingJobRecord } from '../domain/job';
import type { PlatformUserRecord } from '../domain/platformUser';
import { MatchingEmbeddingService } from '../integrations/openai';
import { normalizeLocation } from './location';
import { scoreJob, type ScoredMatchingJob } from './scoring';
import type { MatchingJobRepository } from '../repositories/matchingJobRepository';

export interface MatchingServiceDependencies {
  jobs: Pick<MatchingJobRepository, 'queryJobs'>;
  platformUsers: {
    getById(uid: string): Promise<PlatformUserRecord | null>;
  };
  feedback: {
    listByUser(userId: string): Promise<MatchingFeedbackRecord[]>;
  };
  embeddings: Pick<MatchingEmbeddingService, 'createEmbedding'>;
  now?: () => Date;
}

export interface MatchingRequest {
  userId: string;
  limit: number;
}

export interface ProfileMatchingRequest {
  profile: PlatformUserRecord;
  limit: number;
  feedbackRecords?: MatchingFeedbackRecord[];
  excludeJobIds?: string[];
}

function buildJobTypePreference(jobType: string | null | undefined) {
  if (jobType === 'intern' || jobType === 'new_grad') {
    return jobType;
  }

  return undefined;
}

function buildLocationQuery(preferredLocations: string[]) {
  const normalized = [...new Set(preferredLocations.map((location) => normalizeLocation(location)))];
  if (normalized.length === 0 || normalized.includes('remote')) {
    return [];
  }

  return [...new Set([...normalized, 'remote'])];
}

function buildFeedbackSignals(feedbackRecords: MatchingFeedbackRecord[]) {
  return {
    likedCompanies: feedbackRecords
      .filter((record) => record.reaction === 'like' || record.reaction === 'applied')
      .map((record) => record.companyName)
      .filter((name): name is string => Boolean(name)),
    dislikedCompanies: feedbackRecords
      .filter((record) => record.reaction === 'dislike')
      .map((record) => record.companyName)
      .filter((name): name is string => Boolean(name)),
  };
}

function buildIndustryQueries(preferredIndustries: string[]) {
  const normalized = [...new Set(preferredIndustries.map((industry) => industry.toLowerCase()))];
  return normalized.length > 0 ? normalized : [null];
}

function buildQueryText(profile: PlatformUserRecord) {
  return profile.skills.length > 0 ? profile.skills.join(', ') : 'software engineer';
}

export async function getMatchingResults(
  request: MatchingRequest,
  dependencies: MatchingServiceDependencies,
): Promise<{
  matches: ScoredMatchingJob[];
  candidateCount: number;
}> {
  const profile = await dependencies.platformUsers.getById(request.userId);
  if (!profile) {
    throw new Error(`Platform user "${request.userId}" was not found.`);
  }

  const feedbackRecords = await dependencies.feedback.listByUser(request.userId);
  return getMatchingResultsForProfile(
    {
      profile,
      limit: request.limit,
      feedbackRecords,
    },
    dependencies,
  );
}

export async function getMatchingResultsForProfile(
  request: ProfileMatchingRequest,
  dependencies: Pick<MatchingServiceDependencies, 'jobs' | 'embeddings' | 'now'>,
): Promise<{
  matches: ScoredMatchingJob[];
  candidateCount: number;
}> {
  const profile = request.profile;
  const feedbackRecords = request.feedbackRecords ?? [];
  const feedbackSignals = buildFeedbackSignals(feedbackRecords);
  const feedbackJobIds = new Set([
    ...feedbackRecords.map((record) => record.jobId),
    ...(request.excludeJobIds ?? []),
  ]);
  const postedAfter = new Date((dependencies.now ?? (() => new Date()))().getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const locationBuckets = buildLocationQuery(profile.preferences.preferredLocations);
  const industries = buildIndustryQueries(profile.preferences.preferredIndustries);

  const candidates = new Map<string, MatchingJobRecord>();
  for (const industryKey of industries) {
    const jobs = await dependencies.jobs.queryJobs({
      limit: 500,
      status: 'active',
      jobType: buildJobTypePreference(profile.preferences.jobType),
      requiresSponsorship: profile.preferences.sponsorshipNeeded,
      industryKey,
      locationBuckets,
      postedAfter,
    });

    for (const job of jobs) {
      if (!feedbackJobIds.has(job.id)) {
        candidates.set(job.id, job);
      }
    }

    if (candidates.size >= 500) {
      break;
    }
  }

  const queryEmbedding = await dependencies.embeddings.createEmbedding(buildQueryText(profile));
  const now = (dependencies.now ?? (() => new Date()))();
  const scored = [...candidates.values()].map((job) =>
    scoreJob({
      job,
      profile,
      feedbackSignals,
      queryEmbedding,
      now,
    }),
  );

  scored.sort((left, right) => right.score - left.score);

  return {
    matches: scored.slice(0, request.limit),
    candidateCount: scored.length,
  };
}
