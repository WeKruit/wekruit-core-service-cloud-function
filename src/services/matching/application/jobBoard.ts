import { Buffer } from 'node:buffer';

import type { MatchingJobRecord, MatchingJobStatus } from '../domain/job';
import { getLocationBuckets, normalizeLocation } from './location';
import { buildSearchTokens } from './search';
import type { MatchingJobCursor, MatchingJobRepository } from '../repositories/matchingJobRepository';

export interface JobBoardRequest {
  limit: number;
  cursor?: string | null;
  status?: MatchingJobStatus;
  industry?: string | null;
  location?: string | null;
  keyword?: string | null;
  skills?: string[];
  seniorityLevel?: string | null;
  sponsorship?: boolean | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
}

export interface PublicJobBoardRecord {
  jobId: string;
  sourceRepo: string | null;
  jobType: MatchingJobRecord['jobType'];
  companyName: string | null;
  roleTitle: string | null;
  primaryUrl: string | null;
  atsApplyUrl: string | null;
  locationRaw: string | null;
  datePostedRaw: string | null;
  status: MatchingJobStatus;
  jobDescription: string | null;
  coreResponsibilities: string[];
  salaryRange: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  seniorityLevel: string | null;
  benefits: string[];
  qualifications: string[];
  industry: string | null;
  companySize: string | null;
  requiredSkills: string[];
  sponsorship: boolean | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  enrichedAt: string | null;
}

function toPublicJobBoardRecord(job: MatchingJobRecord): PublicJobBoardRecord {
  return {
    jobId: job.id,
    sourceRepo: job.sourceRepo,
    jobType: job.jobType,
    companyName: job.companyName,
    roleTitle: job.roleTitle,
    primaryUrl: job.primaryUrl,
    atsApplyUrl: job.atsApplyUrl,
    locationRaw: job.locationRaw,
    datePostedRaw: job.datePostedRaw,
    status: job.status,
    jobDescription: job.jobDescription,
    coreResponsibilities: job.coreResponsibilities,
    salaryRange: job.salaryRange,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    seniorityLevel: job.seniorityLevel,
    benefits: job.benefits,
    qualifications: job.qualifications,
    industry: job.industry,
    companySize: job.companySize,
    requiredSkills: job.requiredSkills,
    sponsorship: job.sponsorship,
    firstSeenAt: job.firstSeenAt,
    lastSeenAt: job.lastSeenAt,
    enrichedAt: job.enrichedAt,
  };
}

function encodeCursor(cursor: MatchingJobCursor | null) {
  if (!cursor) {
    return null;
  }

  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | null | undefined): MatchingJobCursor | null {
  if (!cursor) {
    return null;
  }

  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as MatchingJobCursor;
  if (!parsed?.firstSeenAt || !parsed?.id) {
    return null;
  }

  return parsed;
}

function passesPostFilters(job: MatchingJobRecord, request: JobBoardRequest) {
  if (request.location) {
    const target = normalizeLocation(request.location);
    const jobBuckets = job.locationBuckets.length > 0 ? job.locationBuckets : getLocationBuckets(job.locationRaw);
    if (!jobBuckets.includes(target) && !jobBuckets.includes('remote')) {
      return false;
    }
  }

  if (request.keyword) {
    const tokens = buildSearchTokens(request.keyword);
    if (!tokens.some((token) => job.searchTokens.includes(token))) {
      return false;
    }
  }

  if (request.skills && request.skills.length > 0) {
    const normalizedSkills = request.skills.map((skill) => skill.toLowerCase());
    if (!normalizedSkills.some((skill) => job.requiredSkillsIndex.includes(skill))) {
      return false;
    }
  }

  if (request.salaryMin !== null && request.salaryMin !== undefined) {
    if (job.salaryMax === null || job.salaryMax < request.salaryMin) {
      return false;
    }
  }

  if (request.salaryMax !== null && request.salaryMax !== undefined) {
    if (job.salaryMin === null || job.salaryMin > request.salaryMax) {
      return false;
    }
  }

  return true;
}

export async function getJobBoardPage(
  request: JobBoardRequest,
  dependencies: {
    jobs: Pick<MatchingJobRepository, 'queryJobs'>;
  },
) {
  const keywordTokens = request.keyword ? buildSearchTokens(request.keyword) : [];
  const normalizedSkills = request.skills?.map((skill) => skill.toLowerCase()) ?? [];
  const locationBuckets = request.location ? [normalizeLocation(request.location), 'remote'] : [];
  const queryLimit = Math.min(Math.max(request.limit * 4, request.limit), 200);

  const jobs = await dependencies.jobs.queryJobs({
    limit: queryLimit,
    status: request.status ?? 'active',
    requiresSponsorship: request.sponsorship ?? undefined,
    industryKey: request.industry?.toLowerCase() ?? null,
    seniorityLevel: request.seniorityLevel?.toLowerCase() ?? null,
    searchTokens: keywordTokens.length > 0 ? keywordTokens : undefined,
    requiredSkills:
      keywordTokens.length === 0 && normalizedSkills.length > 0 ? normalizedSkills : undefined,
    locationBuckets:
      keywordTokens.length === 0 && normalizedSkills.length === 0 && locationBuckets.length > 0
        ? locationBuckets
        : undefined,
    cursor: decodeCursor(request.cursor),
  });

  const filtered = jobs.filter((job) => passesPostFilters(job, request)).slice(0, request.limit);
  const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

  return {
    jobs: filtered.map(toPublicJobBoardRecord),
    nextCursor:
      jobs.length === queryLimit && lastJob
        ? encodeCursor({
            firstSeenAt: lastJob.firstSeenAt ?? '',
            id: lastJob.id,
          })
        : null,
  };
}

export async function getJobDetail(
  jobId: string,
  dependencies: {
    jobs: Pick<MatchingJobRepository, 'getById'>;
  },
) {
  const job = await dependencies.jobs.getById(jobId);
  return job ? toPublicJobBoardRecord(job) : null;
}
