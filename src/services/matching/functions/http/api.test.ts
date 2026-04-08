import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import type { PlatformUserSyncDependencies } from '../../application/userSync';
import type { MatchingServiceDependencies } from '../../application/matching';
import { buildMatchingApiApp } from './api';
import type { MatchingJobSyncDependencies } from '../../application/jobSync';

async function withServer(
  dependencies: {
    userSyncDependencies: PlatformUserSyncDependencies;
    jobSyncDependencies: MatchingJobSyncDependencies;
    matchingDependencies?: Partial<MatchingServiceDependencies>;
    feedbackDependencies?: {
      jobs?: {
        getById: (jobId: string) => Promise<unknown>;
      };
      feedback?: {
        listByUser?: (userId: string) => Promise<unknown[]>;
        upsert: (record: unknown) => Promise<void>;
      };
      savedJobs?: {
        save: (record: unknown) => Promise<void>;
        remove: (userId: string, jobId: string) => Promise<void>;
      };
      now?: () => Date;
    };
    jobBoardDependencies?: {
      jobs: {
        queryJobs: (options: unknown) => Promise<unknown[]>;
        getById?: (jobId: string) => Promise<unknown>;
      };
    };
    legacyProxyDependencies?: {
      fetch: typeof fetch;
      baseUrl?: string;
      apiKey?: string;
    };
  },
  run: (baseUrl: string) => Promise<void>,
) {
  const app = buildMatchingApiApp({
    syncApiKey: 'phase-20-sync-key',
    userSyncDependencies: dependencies.userSyncDependencies,
    jobSyncDependencies: dependencies.jobSyncDependencies,
    matchingDependencies: dependencies.matchingDependencies,
    feedbackDependencies: dependencies.feedbackDependencies as never,
    jobBoardDependencies: dependencies.jobBoardDependencies as never,
    legacyProxyDependencies: dependencies.legacyProxyDependencies,
  });

  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Server failed to bind to a test port.');
  }

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

function buildUserSyncDependencies(): PlatformUserSyncDependencies {
  return {
    source: {
      async getAggregatedUser(uid: string) {
        return {
          user: {
            id: uid,
            email: 'ana@wekruit.com',
            name: 'Ana Gomez',
            avatarUrl: null,
            location: 'Chicago, IL',
            skills: ['TypeScript'],
            preferences: {
              jobPreferences: {
                targetJobTitles: ['Software Engineer'],
              },
            },
            status: 'active',
            subscriptionTier: 'free',
            updatedAt: '2026-04-01T10:00:00.000Z',
          },
          applicationProfile: {
            userId: uid,
            workAuthorization: 'US Citizen',
            visaSponsorship: 'No',
            preferredWorkMode: 'remote',
            preferredLocations: 'Chicago, IL',
            updatedAt: '2026-04-01T10:05:00.000Z',
          },
          defaultResume: {
            userId: uid,
            status: 'parsed',
            isDefault: true,
            parsedData: {
              summary: 'Platform engineer.',
              totalYearsExperience: 5,
            },
            parsedAt: '2026-04-01T10:06:00.000Z',
          },
        };
      },
    },
    repository: {
      async getSyncState() {
        return null;
      },
      async upsert() {},
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    now: () => new Date('2026-04-01T12:00:00.000Z'),
  };
}

function buildJobSyncDependencies(): MatchingJobSyncDependencies {
  return {
    repository: {
      async getSyncStates() {
        return new Map();
      },
      async upsertJobs() {},
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    now: () => new Date('2026-04-01T12:00:00.000Z'),
  };
}

test('GET /health returns the matching service heartbeat', async () => {
  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      const payload = (await response.json()) as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.service, 'matching');
    },
  );
});

test('GET / returns the legacy matching engine heartbeat', async () => {
  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/`);
      const payload = (await response.json()) as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(payload.status, 'ok');
      assert.equal(payload.service, 'wekruit-matching');
    },
  );
});

test('POST /api/sync/user-changed rejects requests without the webhook signature header', async () => {
  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/sync/user-changed`, {
        method: 'POST',
        headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'UPDATE',
        table: 'users',
        schema: 'public',
        record: {
          id: '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52',
        },
      }),
    });

      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 401);
      assert.equal(payload.ok, false);
    },
  );
});

test('POST /api/sync/user-changed accepts a valid webhook and syncs the user record', async () => {
  let upsertCount = 0;

  await withServer(
    {
      userSyncDependencies: {
        ...buildUserSyncDependencies(),
        repository: {
          async getSyncState() {
            return null;
          },
          async upsert() {
            upsertCount += 1;
          },
        },
      },
      jobSyncDependencies: buildJobSyncDependencies(),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/sync/user-changed`, {
        method: 'POST',
        headers: {
          'x-webhook-signature': 'Bearer phase-20-sync-key',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'UPDATE',
          table: 'users',
          schema: 'public',
          record: {
            id: '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52',
          },
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.status, 'updated');
    },
  );

  assert.equal(upsertCount, 1);
});

test('POST /api/sync/jobs accepts a valid batch and upserts the changed jobs', async () => {
  let upsertedJobCount = 0;

  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: {
        ...buildJobSyncDependencies(),
        repository: {
          async getSyncStates() {
            return new Map();
          },
          async upsertJobs(jobs) {
            upsertedJobCount += jobs.length;
          },
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/sync/jobs`, {
        method: 'POST',
        headers: {
          'x-api-key': 'phase-20-sync-key',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
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
            },
          ],
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(payload.upserted, 1);
    },
  );

  assert.equal(upsertedJobCount, 1);
});

test('POST /match returns legacy snake_case matches for the discover flow', async () => {
  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
      matchingDependencies: {
        jobs: {
          async queryJobs() {
            return [
              {
                id: 'job-1',
                sourceRepo: 'Summer2026-Internships',
                jobType: 'intern',
                companyName: 'Acme',
                roleTitle: 'Software Engineer Intern',
                primaryUrl: 'https://jobs.example/job-1',
                locationRaw: 'Chicago, IL',
                datePostedRaw: '1d',
                status: 'active',
                contentHash: 'hash-1',
                jobDescription: 'Build features.',
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
                searchTokens: ['acme', 'software'],
                industryKey: 'software',
                sponsorship: true,
                embedding: [1, 0, 0],
                embeddingModel: 'text-embedding-3-small',
                firstSeenAt: '2026-04-01T00:00:00.000Z',
                lastSeenAt: '2026-04-01T00:00:00.000Z',
                enrichedAt: '2026-04-01T00:00:00.000Z',
                embeddedAt: '2026-04-01T00:00:00.000Z',
                syncedAt: '2026-04-01T00:00:00.000Z',
              },
            ];
          },
        } as never,
        platformUsers: {
          async getById() {
            return {
              uid: 'user-1',
              email: 'ana@wekruit.com',
              name: 'Ana',
              avatarUrl: null,
              location: 'Chicago, IL',
              status: 'active',
              subscriptionTier: 'free',
              skills: ['TypeScript'],
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
          },
        } as never,
        feedback: {
          async listByUser() {
            return [];
          },
        } as never,
        embeddings: {
          async createEmbedding() {
            return [1, 0, 0];
          },
        } as never,
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/match`, {
        method: 'POST',
        headers: {
          'x-api-key': 'phase-20-sync-key',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          user_id: 'user-1',
          job_type: 'intern',
          location_prefs: ['Chicago, IL'],
          industries: ['software'],
          skills: ['TypeScript'],
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 200);
      assert.ok(Array.isArray(payload.matches));
      assert.deepEqual((payload.matches as Array<Record<string, unknown>>)[0], {
        job_id: 'job-1',
        company_name: 'Acme',
        role_title: 'Software Engineer Intern',
        location_raw: 'Chicago, IL',
        primary_url: 'https://jobs.example/job-1',
        source_repo: 'Summer2026-Internships',
        industry: 'software',
        company_size: 'startup',
        score: 0.946667,
        signals: {
          title_similarity: 1,
          skills_overlap: 1,
          industry_match: 1,
          company_size_match: 1,
          location_fit: 1,
          recency: 0.966667,
          feedback_boost: 0.5,
        },
        matched_skills: ['TypeScript'],
        required_skills: ['TypeScript'],
        date_posted_raw: '1d',
        first_seen_at: '2026-04-01T00:00:00.000Z',
        sponsorship: true,
        job_description: 'Build features.',
      });
    },
  );
});

test('POST /feedback accepts the legacy contract and records feedback', async () => {
  let upsertedRecord: Record<string, unknown> | null = null;

  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
      feedbackDependencies: {
        jobs: {
          async getById() {
            return {
              id: 'job-1',
              companyName: 'Acme',
              roleTitle: 'Software Engineer Intern',
            };
          },
        },
        feedback: {
          async upsert(record) {
            upsertedRecord = record as Record<string, unknown>;
          },
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/feedback`, {
        method: 'POST',
        headers: {
          'x-api-key': 'phase-20-sync-key',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          user_id: 'user-1',
          job_id: 'job-1',
          reaction: 'like',
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 200);
      assert.deepEqual(payload, { status: 'ok' });
    },
  );

  assert.equal(upsertedRecord?.['userId'], 'user-1');
  assert.equal(upsertedRecord?.['jobId'], 'job-1');
  assert.equal(upsertedRecord?.['reaction'], 'like');
});

test('POST /api/matching/matches returns ranked matches from the matching service', async () => {
  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
      matchingDependencies: {
        jobs: {
          async queryJobs() {
            return [];
          },
        } as never,
        platformUsers: {
          async getById() {
            return {
              uid: 'user-1',
              email: 'ana@wekruit.com',
              name: 'Ana',
              avatarUrl: null,
              location: 'Chicago, IL',
              status: 'active',
              subscriptionTier: 'free',
              skills: ['TypeScript'],
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
          },
        } as never,
        feedback: {
          async listByUser() {
            return [];
          },
        } as never,
        embeddings: {
          async createEmbedding() {
            return [1, 0, 0];
          },
        } as never,
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/matching/matches`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          userId: 'user-1',
          limit: 5,
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.ok(Array.isArray(payload.matches));
    },
  );
});

test('POST /api/v1/matching/recommendations returns a JobX-compatible response', async () => {
  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
      matchingDependencies: {
        jobs: {
          async queryJobs() {
            return [
              {
                id: 'job-1',
                sourceRepo: 'New-Grad-Positions',
                jobType: 'new_grad',
                companyName: 'Acme',
                roleTitle: 'Software Engineer',
                primaryUrl: 'https://jobs.example/job-1',
                locationRaw: 'Austin, TX',
                datePostedRaw: '1d',
                status: 'active',
                contentHash: 'hash-1',
                jobDescription: 'Build features.',
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
                locationBuckets: ['austin'],
                searchTokens: ['acme', 'software'],
                industryKey: 'software',
                sponsorship: false,
                embedding: [1, 0, 0],
                embeddingModel: 'text-embedding-3-small',
                firstSeenAt: '2026-04-01T00:00:00.000Z',
                lastSeenAt: '2026-04-01T00:00:00.000Z',
                enrichedAt: '2026-04-01T00:00:00.000Z',
                embeddedAt: '2026-04-01T00:00:00.000Z',
                syncedAt: '2026-04-01T00:00:00.000Z',
              },
            ];
          },
        } as never,
        platformUsers: {
          async getById() {
            return null;
          },
        } as never,
        feedback: {
          async listByUser() {
            return [];
          },
        } as never,
        embeddings: {
          async createEmbedding() {
            return [1, 0, 0];
          },
        } as never,
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/matching/recommendations`, {
        method: 'POST',
        headers: {
          'x-api-key': 'phase-20-sync-key',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          candidate: {
            id: 'user-1',
            summary: 'Platform engineer',
            skills: ['TypeScript'],
            workAuthorization: 'US Citizen',
            totalYearsExperience: 2,
            education: [],
            workHistory: [],
          },
          top_n: 5,
          min_cosine_score: 0.2,
          excludeJobIds: [],
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      assert.equal(response.status, 200);
      assert.deepEqual(payload.meta, {
        needs_sponsorship: false,
        user_total_years_experience: 2,
        user_degree_rank: 0,
        user_skill_count: 1,
        user_domain: 'software_engineering',
        user_seniority: 'entry',
        top_k: 100,
        top_n: 5,
        results_returned: 1,
      });
      assert.deepEqual((payload.results as Array<Record<string, unknown>>)[0], {
        job_id: 'job-1',
        source: 'Acme',
        title: 'Software Engineer',
        apply_url: 'https://jobs.example/job-1',
        locations: [{ display_name: 'Austin, TX', is_primary: true }],
        department: null,
        team: null,
        employment_type: 'full_time',
        cosine_score: 1,
        skill_overlap_score: 1,
        domain_match_score: 0.3,
        seniority_match_score: 0.5,
        experience_gap: 0,
        education_gap: 0,
        penalties: {
          experience_penalty: 0,
          education_penalty: 0,
          total_penalty: 0,
        },
        score_breakdown: {
          cosine_component: 0.3,
          skill_component: 0.25,
          domain_component: 0.03,
          seniority_component: 0.05,
        },
        final_score: 0.876667,
        hard_filter: {
          passed: true,
          reasons: [],
        },
        llm_adjusted_score: 0.876667,
        llm_recommendation: null,
        llm_reasons: [],
        llm_gaps: [],
        llm_resume_focus_points: [],
        llm_adjustment: 0,
        llm_enriched: false,
      });
    },
  );
});

test('GET /api/matching/jobs returns a paginated job board page', async () => {
  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
      jobBoardDependencies: {
        jobs: {
          async queryJobs() {
            return [
              {
                id: 'job-1',
                sourceRepo: 'Summer2026-Internships',
                jobType: 'intern',
                companyName: 'Acme',
                roleTitle: 'Software Engineer Intern',
                primaryUrl: 'https://jobs.example/job-1',
                locationRaw: 'Chicago, IL',
                datePostedRaw: '1d',
                status: 'active',
                contentHash: 'hash-1',
                jobDescription: 'Build features.',
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
                searchTokens: ['acme', 'software'],
                industryKey: 'software',
                sponsorship: true,
                embedding: [1, 0, 0],
                embeddingModel: 'text-embedding-3-small',
                firstSeenAt: '2026-04-01T00:00:00.000Z',
                lastSeenAt: '2026-04-01T00:00:00.000Z',
                enrichedAt: '2026-04-01T00:00:00.000Z',
                embeddedAt: '2026-04-01T00:00:00.000Z',
                syncedAt: '2026-04-01T00:00:00.000Z',
              },
            ];
          },
          async getById() {
            return null;
          },
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/matching/jobs?limit=10&keyword=acme`);
      const payload = (await response.json()) as Record<string, unknown>;
      const jobs = payload.jobs as Array<Record<string, unknown>>;

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.ok(Array.isArray(payload.jobs));
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0]?.jobId, 'job-1');
      assert.equal(jobs[0]?.roleTitle, 'Software Engineer Intern');
      assert.equal('embedding' in jobs[0], false);
      assert.equal('embeddingModel' in jobs[0], false);
      assert.equal('contentHash' in jobs[0], false);
      assert.equal('requiredSkillsIndex' in jobs[0], false);
      assert.equal('searchTokens' in jobs[0], false);
      assert.equal('locationBuckets' in jobs[0], false);
    },
  );
});

test('GET /api/matching/jobs/:jobId returns sanitized job detail', async () => {
  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
      jobBoardDependencies: {
        jobs: {
          async queryJobs() {
            return [];
          },
          async getById() {
            return {
              id: 'job-1',
              sourceRepo: 'Summer2026-Internships',
              jobType: 'intern',
              companyName: 'Acme',
              roleTitle: 'Software Engineer Intern',
              primaryUrl: 'https://jobs.example/job-1',
              locationRaw: 'Chicago, IL',
              datePostedRaw: '1d',
              status: 'active',
              contentHash: 'hash-1',
              jobDescription: 'Build features.',
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
              searchTokens: ['acme', 'software'],
              industryKey: 'software',
              sponsorship: true,
              embedding: [1, 0, 0],
              embeddingModel: 'text-embedding-3-small',
              firstSeenAt: '2026-04-01T00:00:00.000Z',
              lastSeenAt: '2026-04-01T00:00:00.000Z',
              enrichedAt: '2026-04-01T00:00:00.000Z',
              embeddedAt: '2026-04-01T00:00:00.000Z',
              syncedAt: '2026-04-01T00:00:00.000Z',
            };
          },
        },
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/matching/jobs/job-1`);
      const payload = (await response.json()) as Record<string, unknown>;
      const job = payload.job as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(payload.ok, true);
      assert.equal(job.jobId, 'job-1');
      assert.equal(job.roleTitle, 'Software Engineer Intern');
      assert.equal('embedding' in job, false);
      assert.equal('embeddingModel' in job, false);
      assert.equal('contentHash' in job, false);
      assert.equal('requiredSkillsIndex' in job, false);
      assert.equal('searchTokens' in job, false);
      assert.equal('locationBuckets' in job, false);
    },
  );
});

test('GET /jobs/stats proxies the legacy request with API-key auth', async () => {
  const proxyCalls: Array<{ url: string; apiKey: string | null }> = [];

  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
      legacyProxyDependencies: {
        fetch: async (input, init) => {
          proxyCalls.push({
            url: String(input),
            apiKey: new Headers(init?.headers).get('x-api-key'),
          });
          return new Response(
            JSON.stringify({
              stats: [
                {
                  source_repo: 'Summer2026-Internships',
                  status: 'active',
                  count: 42,
                },
              ],
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        },
        baseUrl: 'https://legacy.example',
        apiKey: 'phase-20-sync-key',
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/jobs/stats`, {
        headers: {
          'x-api-key': 'phase-20-sync-key',
        },
      });
      const payload = (await response.json()) as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.deepEqual(payload, {
        stats: [
          {
            source_repo: 'Summer2026-Internships',
            status: 'active',
            count: 42,
          },
        ],
      });
    },
  );

  assert.deepEqual(proxyCalls, [
    {
      url: 'https://legacy.example/jobs/stats',
      apiKey: 'phase-20-sync-key',
    },
  ]);
});

test('POST /analyze-url proxies the legacy request body with API-key auth', async () => {
  let proxyBody: Record<string, unknown> | null = null;

  await withServer(
    {
      userSyncDependencies: buildUserSyncDependencies(),
      jobSyncDependencies: buildJobSyncDependencies(),
      legacyProxyDependencies: {
        fetch: async (_input, init) => {
          proxyBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return new Response(
            JSON.stringify({
              jobTitle: 'Software Engineer',
              company: 'Acme',
              jobDescription: 'Build features.',
              requiredSkills: ['TypeScript'],
              preferredSkills: [],
              matchedSkills: ['TypeScript'],
              matchScore: 88,
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json',
              },
            },
          );
        },
        baseUrl: 'https://legacy.example',
        apiKey: 'phase-20-sync-key',
      },
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/analyze-url`, {
        method: 'POST',
        headers: {
          'x-api-key': 'phase-20-sync-key',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          url: 'https://jobs.example/job-1',
          user_skills: ['TypeScript'],
        }),
      });
      const payload = (await response.json()) as Record<string, unknown>;

      assert.equal(response.status, 200);
      assert.equal(payload.jobTitle, 'Software Engineer');
      assert.equal(payload.company, 'Acme');
    },
  );

  assert.deepEqual(proxyBody, {
    url: 'https://jobs.example/job-1',
    user_skills: ['TypeScript'],
  });
});
