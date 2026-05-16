import assert from 'node:assert/strict';
import { Server } from 'node:http';
import test from 'node:test';

import {
  createSourcingApiApp,
  type SourcingHttpServicePort,
} from './api';
import {
  PendingMergeReviewBlockError,
  VendorProfileLookupProviderError,
  VendorProfileLookupValidationError,
} from '../../application/service';

async function withTestServer(
  service: Partial<SourcingHttpServicePort>,
  callback: (baseUrl: string) => Promise<void>,
) {
  const app = createSourcingApiApp(service as SourcingHttpServicePort);
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await callback(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('taxonomy route returns legacy and canonical sourcing options', async () => {
  await withTestServer(
    {},
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/sourcing/taxonomy`);
      const body = await response.json() as {
        data?: {
          schemaVersion?: string;
          legacy?: {
            tracks?: string[];
            industryDomains?: string[];
          };
          canonical?: {
            roleFunctions?: string[];
            industrySectors?: string[];
            relevantTags?: { max?: number; pattern?: string };
            skillBuckets?: string[];
          };
        };
      };

      assert.equal(response.status, 200);
      assert.equal(body.data?.schemaVersion, 'sourcing-taxonomy-v1');
      assert.ok(body.data?.legacy?.tracks?.includes('software_engineering'));
      assert.ok(body.data?.legacy?.industryDomains?.includes('healthcare_ai'));
      assert.ok(body.data?.canonical?.roleFunctions?.includes('software_engineering'));
      assert.ok(body.data?.canonical?.industrySectors?.includes('artificial_intelligence_and_machine_learning'));
      assert.equal(body.data?.canonical?.relevantTags?.max, 12);
      assert.equal(body.data?.canonical?.relevantTags?.pattern, '^[a-z][a-z0-9_]{1,79}$');
      assert.ok(body.data?.canonical?.skillBuckets?.includes('programming_languages'));
    },
  );
});

test('vendor profile match list route returns normalized lookup state', async () => {
  await withTestServer(
    {
      listVendorProfileMatchesForApprovedEntity: async (approvedEntityId: string) => ({
        approvedEntityId,
        eligibleLinkedInUrls: [
          {
            url: 'https://www.linkedin.com/in/spencerwang1',
            sourceRecordIds: ['src_spencer'],
            evidenceIds: ['evidence_spencer_linkedin'],
            sourcePaths: ['rawSummary.linkedin'],
          },
        ],
        runs: [],
        matches: [],
      }),
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/sourcing/approved-entities/cand_spencer/vendor-profile-matches`);
      const body = await response.json() as { data?: { approvedEntityId?: string; eligibleLinkedInUrls?: unknown[] } };

      assert.equal(response.status, 200);
      assert.equal(body.data?.approvedEntityId, 'cand_spencer');
      assert.equal(body.data?.eligibleLinkedInUrls?.length, 1);
    },
  );
});

test('vendor lookup run route returns 201 for new run and 200 for reused run', async () => {
  await withTestServer(
    {
      runProfessionalProfileLookupForApprovedEntity: async (_approvedEntityId: string, selectedLinkedInUrl: string) => ({
        approvedEntityId: 'cand_spencer',
        eligibleLinkedInUrls: [],
        runs: [],
        matches: [],
        run: {
          id: 'vendor_run_spencer',
          approvedEntityId: 'cand_spencer',
          provider: 'fake',
          lookupType: 'linkedin_profile_by_url',
          inputUrlHash: 'hash',
          selectedLinkedInUrl,
          selectedLinkedInUrlLineage: {},
          datasetId: 'fake-linkedin-profiles',
          status: selectedLinkedInUrl.endsWith('/reuse') ? 'completed' : 'running',
          snapshotId: null,
          matchIds: [],
          error: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
        matchesForRun: [],
        reusedExisting: selectedLinkedInUrl.endsWith('/reuse'),
      }),
    },
    async (baseUrl) => {
      const created = await fetch(
        `${baseUrl}/api/sourcing/approved-entities/cand_spencer/vendor-profile-lookup:run`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedLinkedInUrl: 'https://www.linkedin.com/in/spencerwang1' }),
        },
      );
      const reused = await fetch(
        `${baseUrl}/api/sourcing/approved-entities/cand_spencer/vendor-profile-lookup:run`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedLinkedInUrl: 'https://www.linkedin.com/in/spencerwang1/reuse' }),
        },
      );

      assert.equal(created.status, 201);
      assert.equal(reused.status, 200);
    },
  );
});

test('vendor lookup run route maps merge, validation, and provider errors', async () => {
  const blockers = [
    {
      id: 'dedup_pending',
      displayName: 'Spencer Wang',
      strength: 'strong' as const,
      reasonCodes: ['github_exact'],
      sourceRecordIds: ['src_a', 'src_b'],
      valueHashes: ['hash'],
      updatedAt: '2026-05-10T00:00:00.000Z',
    },
  ];
  await withTestServer(
    {
      runProfessionalProfileLookupForApprovedEntity: async (approvedEntityId: string) => {
        if (approvedEntityId === 'merge') {
          throw new PendingMergeReviewBlockError('merge', blockers);
        }
        if (approvedEntityId === 'provider') {
          throw new VendorProfileLookupProviderError('Provider unavailable.');
        }
        throw new VendorProfileLookupValidationError('Selected LinkedIn URL is not present.');
      },
    },
    async (baseUrl) => {
      const request = (id: string) =>
        fetch(`${baseUrl}/api/sourcing/approved-entities/${id}/vendor-profile-lookup:run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedLinkedInUrl: 'https://www.linkedin.com/in/spencerwang1' }),
        });
      const merge = await request('merge');
      const validation = await request('validation');
      const provider = await request('provider');
      const mergeBody = await merge.json() as { error?: { code?: string; blockers?: unknown[] } };
      const validationBody = await validation.json() as { error?: { code?: string } };
      const providerBody = await provider.json() as { error?: { code?: string; message?: string } };

      assert.equal(merge.status, 409);
      assert.equal(mergeBody.error?.code, 'PENDING_MERGE_REVIEW');
      assert.equal(mergeBody.error?.blockers?.length, 1);
      assert.equal(validation.status, 422);
      assert.equal(validationBody.error?.code, 'VENDOR_PROFILE_LOOKUP_VALIDATION');
      assert.equal(provider.status, 503);
      assert.equal(providerBody.error?.code, 'VENDOR_PROFILE_LOOKUP_PROVIDER');
      assert.equal(providerBody.error?.message, 'Provider unavailable.');
    },
  );
});

test('vendor run refresh and vendor match decision routes call service methods', async () => {
  await withTestServer(
    {
      refreshProfessionalProfileLookupRun: async (runId: string) => ({
        approvedEntityId: 'cand_spencer',
        eligibleLinkedInUrls: [],
        runs: [],
        matches: [],
        run: {
          id: runId,
          approvedEntityId: 'cand_spencer',
          provider: 'fake',
          lookupType: 'linkedin_profile_by_url',
          inputUrlHash: 'hash',
          selectedLinkedInUrl: 'https://www.linkedin.com/in/spencerwang1',
          selectedLinkedInUrlLineage: {},
          datasetId: 'fake-linkedin-profiles',
          status: 'completed',
          snapshotId: null,
          matchIds: ['vendor_match_spencer'],
          error: null,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
        matchesForRun: [],
        reusedExisting: false,
      }),
      decideVendorProfileMatch: async (matchId: string) => ({
        match: {
          id: matchId,
          approvedEntityId: 'cand_spencer',
          vendorRunId: 'vendor_run_spencer',
          provider: 'fake',
          lookupType: 'linkedin_profile_by_url',
          inputUrlHash: 'hash',
          selectedLinkedInUrl: 'https://www.linkedin.com/in/spencerwang1',
          selectedLinkedInUrlLineage: {},
          providerRecordId: 'fake:spencerwang1',
          providerProfileUrl: 'https://www.linkedin.com/in/spencerwang1',
          normalizedProfile: {
            profileUrl: 'https://www.linkedin.com/in/spencerwang1',
            name: 'Spencer Wang',
            headline: 'Synthetic profile',
            currentCompany: null,
            location: null,
            educationSummary: [],
            experienceSummary: [],
            skills: [],
            aboutSummary: null,
            projectsPublications: [],
          },
          reviewStatus: 'approved',
          reviewerId: 'route-test',
          reviewNote: 'Looks right.',
          reviewedAt: '2026-05-10T00:00:00.000Z',
          approvedEvidenceId: `vendor_profile_match:${matchId}`,
          createdAt: '2026-05-10T00:00:00.000Z',
          updatedAt: '2026-05-10T00:00:00.000Z',
        },
        approvedEntity: null,
      }),
    },
    async (baseUrl) => {
      const refreshed = await fetch(`${baseUrl}/api/sourcing/vendor-enrichment-runs/vendor_run_spencer/refresh`, {
        method: 'POST',
      });
      const decided = await fetch(`${baseUrl}/api/sourcing/vendor-profile-matches/vendor_match_spencer/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', reviewerId: 'route-test', notes: 'Looks right.' }),
      });
      const decisionBody = await decided.json() as { data?: { match?: { reviewStatus?: string } } };

      assert.equal(refreshed.status, 200);
      assert.equal(decided.status, 200);
      assert.equal(decisionBody.data?.match?.reviewStatus, 'approved');
    },
  );
});
