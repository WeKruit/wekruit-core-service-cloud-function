import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatchingJobRecord } from '../domain/job';
import { getJobBoardPage } from './jobBoard';

function buildJob(id: string, overrides: Partial<MatchingJobRecord> = {}): MatchingJobRecord {
  return {
    id,
    sourceRepo: 'Summer2026-Internships',
    jobType: 'intern',
    companyName: 'Acme',
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
    embedding: [1, 0, 0],
    embeddingModel: 'text-embedding-3-small',
    firstSeenAt: '2026-04-01T00:00:00.000Z',
    lastSeenAt: '2026-04-01T00:00:00.000Z',
    enrichedAt: '2026-04-01T00:00:00.000Z',
    embeddedAt: '2026-04-01T00:00:00.000Z',
    syncedAt: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

test('getJobBoardPage uses Firestore-backed keyword search and returns a next cursor', async () => {
  const page = await getJobBoardPage(
    {
      limit: 1,
      keyword: 'Acme software',
      status: 'active',
    },
    {
      jobs: {
        async queryJobs(options) {
          assert.deepEqual(options.searchTokens, ['acme', 'software']);
          return [buildJob('job-1'), buildJob('job-2'), buildJob('job-3'), buildJob('job-4')];
        },
      },
    },
  );

  assert.equal(page.jobs.length, 1);
  assert.ok(page.nextCursor);
});
