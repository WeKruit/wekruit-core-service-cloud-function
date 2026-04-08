import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMatchingJobRecord,
  syncMatchingJobs,
  type MatchingJobBatchPayload,
  type MatchingJobSyncDependencies,
} from './jobSync';

function buildPayload(): MatchingJobBatchPayload {
  return {
    collection: 'matching-jobs',
    mode: 'incremental',
    jobs: [
      {
        job_id: 'job-1',
        source_repo: 'Summer2026-Internships',
        company_name: 'Acme',
        role_title: 'Software Engineer',
        primary_url: 'https://jobs.example/job-1',
        location_raw: 'Remote',
        date_posted_raw: '1d',
        status: 'active',
        content_hash: 'hash-1',
        job_description: 'Build platform features.',
        core_responsibilities: ['Ship code'],
        salary_range: '$120k-$140k',
        seniority_level: 'mid',
        benefits: ['Health'],
        qualifications: ['TypeScript'],
        industry: 'Software',
        company_size: 'startup',
        required_skills: ['TypeScript', 'Firebase'],
        sponsorship: true,
        embedding: [0.1, 0.2, 0.3],
        embedding_model: 'text-embedding-3-small',
        first_seen_at: '2026-04-01T10:00:00.000Z',
        last_seen_at: '2026-04-01T11:00:00.000Z',
        enriched_at: '2026-04-01T12:00:00.000Z',
        embedded_at: '2026-04-01T13:00:00.000Z',
      },
      {
        job_id: 'job-2',
        source_repo: 'Summer2026-Internships',
        company_name: 'Bravo',
        role_title: 'Data Engineer',
        primary_url: 'https://jobs.example/job-2',
        location_raw: 'Austin, TX',
        date_posted_raw: '2d',
        status: 'inactive',
        content_hash: 'hash-2',
        job_description: 'Own data infrastructure.',
        core_responsibilities: ['Build pipelines'],
        salary_range: '$130k-$150k',
        seniority_level: 'senior',
        benefits: ['401k'],
        qualifications: ['SQL'],
        industry: 'Fintech',
        company_size: 'mid',
        required_skills: ['SQL', 'Python'],
        sponsorship: false,
        embedding: [0.4, 0.5, 0.6],
        embedding_model: 'text-embedding-3-small',
        first_seen_at: '2026-04-01T10:00:00.000Z',
        last_seen_at: '2026-04-01T11:00:00.000Z',
        enriched_at: '2026-04-01T12:00:00.000Z',
        embedded_at: '2026-04-01T13:00:00.000Z',
      },
    ],
  };
}

test('buildMatchingJobRecord maps the Python sync payload into the Firestore job document', () => {
  const record = buildMatchingJobRecord({
    raw: buildPayload().jobs[0],
    syncedAt: '2026-04-01T14:00:00.000Z',
  });

  assert.equal(record.id, 'job-1');
  assert.equal(record.status, 'active');
  assert.equal(record.jobType, 'intern');
  assert.equal(record.contentHash, 'hash-1');
  assert.deepEqual(record.embedding, [0.1, 0.2, 0.3]);
  assert.deepEqual(record.requiredSkills, ['TypeScript', 'Firebase']);
  assert.deepEqual(record.requiredSkillsIndex, ['typescript', 'firebase']);
  assert.deepEqual(record.locationBuckets, ['remote']);
  assert.deepEqual(record.searchTokens, ['acme', 'software', 'engineer']);
  assert.equal(record.salaryMin, 120000);
  assert.equal(record.salaryMax, 140000);
});

test('syncMatchingJobs upserts jobs whose content_hash, status, or embedding sync state changed', async () => {
  const upserts: string[] = [];
  const dependencies: MatchingJobSyncDependencies = {
    repository: {
      async getSyncStates() {
        return new Map([
          [
            'job-1',
            {
              id: 'job-1',
              contentHash: 'hash-1',
              status: 'active',
              hasEmbedding: false,
            },
          ],
          [
            'job-2',
            {
              id: 'job-2',
              contentHash: 'hash-2',
              status: 'active',
              hasEmbedding: true,
            },
          ],
        ]);
      },
      async upsertJobs(jobs) {
        upserts.push(...jobs.map((job) => job.id));
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    now: () => new Date('2026-04-01T14:00:00.000Z'),
  };

  const result = await syncMatchingJobs(buildPayload(), dependencies);

  assert.deepEqual(upserts, ['job-1', 'job-2']);
  assert.equal(result.received, 2);
  assert.equal(result.upserted, 2);
  assert.equal(result.skipped, 0);
  assert.equal(result.inactive, 1);
});

test('syncMatchingJobs repairs an existing doc when Firestore is missing embedding data', async () => {
  const upserts: string[] = [];
  const dependencies: MatchingJobSyncDependencies = {
    repository: {
      async getSyncStates() {
        return new Map([
          [
            'job-1',
            {
              id: 'job-1',
              contentHash: 'hash-1',
              status: 'active',
              hasEmbedding: false,
            },
          ],
        ]);
      },
      async upsertJobs(jobs) {
        upserts.push(...jobs.map((job) => job.id));
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    now: () => new Date('2026-04-01T14:00:00.000Z'),
  };

  const result = await syncMatchingJobs(
    {
      collection: 'matching-jobs',
      mode: 'incremental',
      jobs: [buildPayload().jobs[0]],
    },
    dependencies,
  );

  assert.deepEqual(upserts, ['job-1']);
  assert.equal(result.upserted, 1);
  assert.equal(result.skipped, 0);
});
