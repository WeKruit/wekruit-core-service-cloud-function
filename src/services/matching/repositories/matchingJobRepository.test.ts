import assert from 'node:assert/strict';
import test from 'node:test';

import { MatchingJobRepository } from './matchingJobRepository';
import type { MatchingJobRecord } from '../domain/job';

interface RecordedSet {
  id: string;
  data: MatchingJobRecord;
  options: { merge: boolean };
}

interface FakeContext {
  store: Map<string, Record<string, unknown>>;
  recordedSets: RecordedSet[];
  batchCommits: number;
  getAllCalls: number;
}

function buildJob(id: string, overrides: Partial<MatchingJobRecord> = {}): MatchingJobRecord {
  return {
    id,
    sourceRepo: 'Summer2026-Internships',
    jobType: 'full_time',
    companyName: 'Acme',
    roleTitle: 'Software Engineer',
    primaryUrl: 'https://jobs.example/' + id,
    atsApplyUrl: null,
    locationRaw: 'Remote',
    datePostedRaw: '1d',
    status: 'active',
    contentHash: 'hash-' + id,
    jobDescription: 'Build platform features.',
    coreResponsibilities: ['Ship code'],
    salaryRange: null,
    salaryMin: null,
    salaryMax: null,
    seniorityLevel: 'mid',
    benefits: [],
    qualifications: [],
    industry: 'Software',
    companySize: 'startup',
    requiredSkills: ['TypeScript'],
    requiredSkillsIndex: ['typescript'],
    locationBuckets: ['remote'],
    searchTokens: ['acme', 'software', 'engineer'],
    industryKey: null,
    sponsorship: false,
    embedding: null,
    embeddingModel: null,
    firstSeenAt: '2026-05-01T00:00:00.000Z',
    lastSeenAt: '2026-05-01T00:00:00.000Z',
    enrichedAt: null,
    embeddedAt: null,
    syncedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Build a fake Firestore harness that records calls + commits. We bypass the
 * MatchingJobRepository constructor (which calls getCoreFirestore()) by using
 * Object.create on the prototype, then injecting the private fields directly.
 * This keeps the upsertJobs implementation under real test, only the Firestore
 * client is faked.
 */
function buildRepo(): { repo: MatchingJobRepository; ctx: FakeContext } {
  const ctx: FakeContext = {
    store: new Map(),
    recordedSets: [],
    batchCommits: 0,
    getAllCalls: 0,
  };

  const makeDocRef = (id: string) => {
    const ref = {
      id,
      _isDocRef: true,
    } as { id: string; _isDocRef: true };
    return ref;
  };

  const makeSnapshot = (id: string) => {
    const data = ctx.store.get(id);
    return {
      id,
      exists: data !== undefined,
      data: () => data,
    };
  };

  const fakeBatch = () => {
    const ops: Array<() => void> = [];
    return {
      set(ref: { id: string }, data: MatchingJobRecord, options: { merge: boolean }) {
        ops.push(() => {
          ctx.recordedSets.push({ id: ref.id, data, options });
          // simulate merge:true semantics — overlay onto existing doc
          const existing = ctx.store.get(ref.id) ?? {};
          ctx.store.set(ref.id, { ...existing, ...data });
        });
      },
      async commit() {
        ctx.batchCommits += 1;
        for (const op of ops) {
          op();
        }
      },
    };
  };

  const fakeFirestore = {
    batch: fakeBatch,
    async getAll(...refs: Array<{ id: string }>) {
      ctx.getAllCalls += 1;
      return refs.map((ref) => makeSnapshot(ref.id));
    },
  };

  const fakeCollection = {
    doc: (id: string) => makeDocRef(id),
  };

  // Bypass constructor's getCoreFirestore() call.
  const repo = Object.create(MatchingJobRepository.prototype) as MatchingJobRepository;
  Object.defineProperty(repo, 'firestore', { value: fakeFirestore, configurable: true });
  Object.defineProperty(repo, 'collection', { value: fakeCollection, configurable: true });

  return { repo, ctx };
}

test('upsertJobs writes a new doc when no existing doc protects it', async () => {
  const { repo, ctx } = buildRepo();
  await repo.upsertJobs([buildJob('job-fresh')]);

  assert.equal(ctx.batchCommits, 1, 'commits exactly one batch');
  assert.equal(ctx.recordedSets.length, 1);
  assert.equal(ctx.recordedSets[0].id, 'job-fresh');
  assert.equal((ctx.recordedSets[0].data as MatchingJobRecord).status, 'active');
});

test('upsertJobs skips a doc whose existing status is inactive (status protection)', async () => {
  const { repo, ctx } = buildRepo();
  // Pre-seed an existing inactive doc
  ctx.store.set('job-inactive', {
    id: 'job-inactive',
    status: 'inactive',
    companyName: 'OldCo',
  });

  await repo.upsertJobs([buildJob('job-inactive', { status: 'active' })]);

  assert.equal(ctx.getAllCalls, 1, 'fetched existing snapshots before write');
  assert.equal(ctx.recordedSets.length, 0, 'no writes performed');
  assert.equal(ctx.batchCommits, 0, 'no batch committed (writeable.length === 0)');

  // The seeded doc should be untouched — status still inactive.
  const stored = ctx.store.get('job-inactive');
  assert.equal(stored?.status, 'inactive', 'inactive status survived upsert');
  assert.equal(stored?.companyName, 'OldCo', 'existing fields not overwritten');
});

test('upsertJobs skips a doc whose existing dead flag is true (dead protection)', async () => {
  const { repo, ctx } = buildRepo();
  ctx.store.set('job-dead', {
    id: 'job-dead',
    status: 'active', // status alone is "active" — we are testing the dead flag
    dead: true,
    companyName: 'GoneCo',
  });

  await repo.upsertJobs([buildJob('job-dead', { status: 'active' })]);

  assert.equal(ctx.recordedSets.length, 0, 'no writes for dead doc');
  assert.equal(ctx.batchCommits, 0);
  const stored = ctx.store.get('job-dead');
  assert.equal(stored?.dead, true, 'dead flag preserved');
  assert.equal(stored?.companyName, 'GoneCo');
});

test('upsertJobs proceeds normally for active existing docs', async () => {
  const { repo, ctx } = buildRepo();
  ctx.store.set('job-active', {
    id: 'job-active',
    status: 'active',
    companyName: 'OldName',
  });

  await repo.upsertJobs([buildJob('job-active', { companyName: 'NewName', status: 'active' })]);

  assert.equal(ctx.recordedSets.length, 1, 'upsert proceeds for active doc');
  assert.equal(ctx.batchCommits, 1);
  const stored = ctx.store.get('job-active');
  assert.equal(stored?.companyName, 'NewName', 'merge updated companyName');
  assert.equal(stored?.status, 'active');
});

test('upsertJobs handles mixed batch (some protected, some writeable)', async () => {
  const { repo, ctx } = buildRepo();
  ctx.store.set('job-inactive', { id: 'job-inactive', status: 'inactive' });
  ctx.store.set('job-dead', { id: 'job-dead', status: 'active', dead: true });
  // job-fresh and job-active have no protection
  ctx.store.set('job-active', { id: 'job-active', status: 'active' });

  await repo.upsertJobs([
    buildJob('job-inactive'),
    buildJob('job-dead'),
    buildJob('job-fresh'),
    buildJob('job-active'),
  ]);

  assert.equal(ctx.recordedSets.length, 2, 'only 2 of 4 jobs written');
  const writtenIds = ctx.recordedSets.map((s) => s.id).sort();
  assert.deepEqual(writtenIds, ['job-active', 'job-fresh']);
  assert.equal(ctx.batchCommits, 1);

  // Protected docs unchanged
  assert.equal(ctx.store.get('job-inactive')?.status, 'inactive');
  assert.equal(ctx.store.get('job-dead')?.dead, true);
});

test('upsertJobs handles a batch where every job is protected — no commit attempted', async () => {
  const { repo, ctx } = buildRepo();
  ctx.store.set('job-a', { id: 'job-a', status: 'inactive' });
  ctx.store.set('job-b', { id: 'job-b', status: 'active', dead: true });

  await repo.upsertJobs([buildJob('job-a'), buildJob('job-b')]);

  assert.equal(ctx.recordedSets.length, 0);
  assert.equal(ctx.batchCommits, 0, 'no empty batch committed');
  assert.equal(ctx.getAllCalls, 1);
});
