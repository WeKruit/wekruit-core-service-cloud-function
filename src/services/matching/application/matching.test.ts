import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatchingFeedbackRecord } from '../domain/feedback';
import type { MatchingJobRecord } from '../domain/job';
import type { PlatformUserRecord } from '../domain/platformUser';
import { getMatchingResults } from './matching';

function buildProfile(): PlatformUserRecord {
  return {
    uid: 'user-1',
    email: 'ana@wekruit.com',
    name: 'Ana',
    avatarUrl: null,
    location: 'Chicago, IL',
    status: 'active',
    subscriptionTier: 'free',
    skills: ['TypeScript', 'SQL'],
    preferences: {
      targetJobTitles: ['Software Engineer'],
      jobType: 'intern',
      preferredLocations: ['Chicago, IL'],
      preferredIndustries: ['software'],
      remotePreference: 'hybrid',
      excludedCompanies: [],
      minimumSalary: null,
      salaryRange: null,
      experienceLevel: 'entry',
      companySizePreference: 'startup',
      sponsorshipNeeded: true,
    },
    workAuthorization: 'US Citizen',
    visaSponsorship: 'No',
    resumeSummary: 'Platform engineer',
    totalYearsExperience: 2,
    sourcePayloadHash: 'hash',
    syncedAt: '2026-04-01T12:00:00.000Z',
    source: {
      eventType: 'INSERT',
      table: 'users',
      schema: 'public',
      usersUpdatedAt: '2026-04-01T11:00:00.000Z',
      applicationProfileUpdatedAt: '2026-04-01T11:05:00.000Z',
      defaultResumeParsedAt: '2026-04-01T11:06:00.000Z',
    },
  };
}

function buildJob(id: string, overrides: Partial<MatchingJobRecord> = {}): MatchingJobRecord {
  return {
    id,
    sourceRepo: 'Summer2026-Internships',
    jobType: 'intern',
    companyName: id === 'job-1' ? 'Acme' : 'Bravo',
    roleTitle: 'Software Engineer Intern',
    primaryUrl: `https://jobs.example/${id}`,
    atsApplyUrl: null,
    locationRaw: 'Chicago, IL',
    datePostedRaw: '1d',
    status: 'active',
    contentHash: `${id}-hash`,
    jobDescription: 'Build product features.',
    coreResponsibilities: ['Ship code'],
    salaryRange: '$120k-$140k',
    salaryMin: 120000,
    salaryMax: 140000,
    seniorityLevel: 'entry',
    benefits: ['Health'],
    qualifications: ['TypeScript'],
    industry: 'software',
    companySize: 'startup',
    requiredSkills: ['TypeScript'],
    requiredSkillsIndex: ['typescript'],
    locationBuckets: ['chicago'],
    searchTokens: ['acme', 'software', 'engineer'],
    industryKey: 'software',
    sponsorship: true,
    embedding: id === 'job-1' ? [1, 0, 0] : [0.4, 0, 0],
    embeddingModel: 'text-embedding-3-small',
    firstSeenAt: '2026-04-01T00:00:00.000Z',
    lastSeenAt: '2026-04-01T00:00:00.000Z',
    enrichedAt: '2026-04-01T00:00:00.000Z',
    embeddedAt: '2026-04-01T00:00:00.000Z',
    syncedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

test('getMatchingResults filters candidates before scoring and excludes already-reacted jobs', async () => {
  const queries: Array<Record<string, unknown>> = [];
  const feedback: MatchingFeedbackRecord[] = [
    {
      id: 'user-1__job-2',
      userId: 'user-1',
      jobId: 'job-2',
      reaction: 'dislike',
      companyName: 'Bravo',
      jobTitle: 'Software Engineer Intern',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    },
  ];

  const result = await getMatchingResults(
    {
      userId: 'user-1',
      limit: 10,
    },
    {
      jobs: {
        async queryJobs(options) {
          queries.push(options as unknown as Record<string, unknown>);
          return [buildJob('job-1'), buildJob('job-2')];
        },
      },
      platformUsers: {
        async getById() {
          return buildProfile();
        },
      },
      feedback: {
        async listByUser() {
          return feedback;
        },
      },
      embeddings: {
        async createEmbedding() {
          return [1, 0, 0];
        },
      },
      now: () => new Date('2026-04-15T00:00:00.000Z'),
    },
  );

  assert.equal(queries.length, 1);
  assert.equal(queries[0].status, 'active');
  assert.equal(queries[0].jobType, 'intern');
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0]?.id, 'job-1');
});
