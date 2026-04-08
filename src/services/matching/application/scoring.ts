import type { MatchingJobRecord } from '../domain/job';
import type { PlatformUserRecord } from '../domain/platformUser';
import { getLocationBuckets, normalizeLocation } from './location';

export const WEIGHTS: Record<string, number> = {
  titleSimilarity: 0.3,
  skillsOverlap: 0.25,
  industryMatch: 0.1,
  companySizeMatch: 0.05,
  locationFit: 0.1,
  recency: 0.1,
  feedbackBoost: 0.1,
};

export interface MatchingFeedbackSignals {
  likedCompanies: string[];
  dislikedCompanies: string[];
}

export interface MatchingScoreBreakdown {
  titleSimilarity: number;
  skillsOverlap: number;
  industryMatch: number;
  companySizeMatch: number;
  locationFit: number;
  recency: number;
  feedbackBoost: number;
}

export interface ScoredMatchingJob extends MatchingJobRecord {
  score: number;
  signals: MatchingScoreBreakdown;
  matchedSkills: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function scoreTitleSimilarity(queryEmbedding: number[], jobEmbedding: number[] | null) {
  if (!jobEmbedding || jobEmbedding.length === 0 || queryEmbedding.length === 0) {
    return 0;
  }

  let dot = 0;
  let normQuery = 0;
  let normJob = 0;
  const length = Math.min(queryEmbedding.length, jobEmbedding.length);

  for (let index = 0; index < length; index += 1) {
    const a = queryEmbedding[index] ?? 0;
    const b = jobEmbedding[index] ?? 0;
    dot += a * b;
    normQuery += a * a;
    normJob += b * b;
  }

  const cosine = dot / (Math.sqrt(normQuery) * Math.sqrt(normJob) + 1e-9);
  return clamp(cosine, 0, 1);
}

export function scoreSkillsOverlap(userSkills: string[], jobSkills: string[]) {
  if (userSkills.length === 0 || jobSkills.length === 0) {
    return 0;
  }

  const userSet = new Set(userSkills.map((skill) => skill.toLowerCase()));
  const jobSet = new Set(jobSkills.map((skill) => skill.toLowerCase()));
  let matched = 0;

  for (const skill of jobSet) {
    if (userSet.has(skill)) {
      matched += 1;
    }
  }

  const coverage = matched / jobSet.size;
  const relevance = matched / userSet.size;
  return coverage * 0.85 + relevance * 0.15;
}

export function scoreIndustryMatch(jobIndustryKey: string | null, preferredIndustries: string[]) {
  if (preferredIndustries.length === 0 || !jobIndustryKey) {
    return 0.3;
  }

  return preferredIndustries.map((item) => item.toLowerCase()).includes(jobIndustryKey) ? 1 : 0.3;
}

export function scoreCompanySizeMatch(jobSize: string | null, preferredSize: string | null) {
  if (!preferredSize || preferredSize.toLowerCase() === 'any') {
    return 1;
  }

  if (!jobSize) {
    return 0.4;
  }

  return jobSize.toLowerCase() === preferredSize.toLowerCase() ? 1 : 0.4;
}

export function scoreLocationFit(locationBuckets: string[], preferredLocations: string[]) {
  if (preferredLocations.length === 0) {
    return 1;
  }

  const preferredBuckets = new Set(preferredLocations.map((location) => normalizeLocation(location)));
  if (preferredBuckets.has('remote')) {
    return 1;
  }

  if (locationBuckets.includes('remote')) {
    return 1;
  }

  return locationBuckets.some((bucket) => preferredBuckets.has(bucket)) ? 1 : 0.2;
}

export function scoreRecency(firstSeenAt: string | null, now: Date) {
  if (!firstSeenAt) {
    return 0;
  }

  const firstSeen = new Date(firstSeenAt);
  if (Number.isNaN(firstSeen.getTime())) {
    return 0;
  }

  const daysOld = Math.floor((now.getTime() - firstSeen.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, 1 - daysOld / 30);
}

export function scoreFeedbackBoost(
  companyName: string | null,
  feedbackSignals: MatchingFeedbackSignals,
) {
  if (!companyName) {
    return 0.5;
  }

  const normalized = companyName.toLowerCase();
  if (feedbackSignals.likedCompanies.map((name) => name.toLowerCase()).includes(normalized)) {
    return 1;
  }
  if (feedbackSignals.dislikedCompanies.map((name) => name.toLowerCase()).includes(normalized)) {
    return 0;
  }

  return 0.5;
}

export function scoreJob(input: {
  job: MatchingJobRecord;
  profile: PlatformUserRecord;
  feedbackSignals: MatchingFeedbackSignals;
  queryEmbedding: number[];
  now: Date;
}): ScoredMatchingJob {
  const userSkillSet = new Set(input.profile.skills.map((skill) => skill.toLowerCase()));
  const matchedSkills = input.job.requiredSkills.filter((skill) => userSkillSet.has(skill.toLowerCase()));

  const signals: MatchingScoreBreakdown = {
    titleSimilarity: scoreTitleSimilarity(input.queryEmbedding, input.job.embedding),
    skillsOverlap: scoreSkillsOverlap(input.profile.skills, input.job.requiredSkills),
    industryMatch: scoreIndustryMatch(
      input.job.industryKey,
      input.profile.preferences.preferredIndustries,
    ),
    companySizeMatch: scoreCompanySizeMatch(
      input.job.companySize,
      input.profile.preferences.companySizePreference,
    ),
    locationFit: scoreLocationFit(
      input.job.locationBuckets.length > 0
        ? input.job.locationBuckets
        : getLocationBuckets(input.job.locationRaw),
      input.profile.preferences.preferredLocations,
    ),
    recency: scoreRecency(input.job.firstSeenAt, input.now),
    feedbackBoost: scoreFeedbackBoost(input.job.companyName, input.feedbackSignals),
  };

  const score =
    signals.titleSimilarity * WEIGHTS.titleSimilarity +
    signals.skillsOverlap * WEIGHTS.skillsOverlap +
    signals.industryMatch * WEIGHTS.industryMatch +
    signals.companySizeMatch * WEIGHTS.companySizeMatch +
    signals.locationFit * WEIGHTS.locationFit +
    signals.recency * WEIGHTS.recency +
    signals.feedbackBoost * WEIGHTS.feedbackBoost;

  return {
    ...input.job,
    score: Number(score.toFixed(6)),
    signals,
    matchedSkills,
  };
}
