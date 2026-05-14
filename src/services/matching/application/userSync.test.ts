import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPlatformUserRecord,
  extractWebhookUid,
  syncPlatformUserFromWebhook,
  type MatchingWebhookPayload,
  type PlatformUserSyncDependencies,
  type ValetUserAggregate,
} from './userSync';

function buildAggregate(): ValetUserAggregate {
  return {
    user: {
      id: '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52',
      email: 'ana@wekruit.com',
      name: 'Ana Gomez',
      avatarUrl: 'https://cdn.example.com/avatar.png',
      location: 'Chicago, IL',
      skills: ['TypeScript', 'Firebase', 'TypeScript', '  '],
      preferences: {
        jobPreferences: {
          targetJobTitles: ['Software Engineer', 'Platform Engineer'],
          jobType: 'intern',
          preferredLocations: ['Chicago, IL', 'Remote'],
          preferredIndustries: ['SaaS', 'AI'],
          remotePreference: 'remote',
          excludedCompanies: ['Example Inc'],
          minimumSalary: 120000,
          salaryRange: {
            min: 120000,
            max: 170000,
            currency: 'USD',
          },
          experienceLevel: 'senior',
          companySizePref: 'startup',
          sponsorshipNeeded: true,
        },
      },
      status: 'active',
      subscriptionTier: 'pro',
      updatedAt: '2026-04-01T10:00:00.000Z',
    },
    applicationProfile: {
      userId: '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52',
      workAuthorization: 'US Citizen',
      visaSponsorship: 'No',
      preferredWorkMode: 'hybrid',
      preferredLocations: 'Austin, TX, Denver, CO',
      updatedAt: '2026-04-01T10:05:00.000Z',
    },
    defaultResume: {
      userId: '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52',
      status: 'parsed',
      isDefault: true,
      parsedData: {
        summary: 'Platform engineer shipping matching systems.',
        totalYearsExperience: 7,
      },
      parsedAt: '2026-04-01T10:06:00.000Z',
    },
  };
}

function buildWebhookPayload(): MatchingWebhookPayload {
  return {
    type: 'UPDATE',
    table: 'users',
    schema: 'public',
    record: {
      id: '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52',
    },
    old_record: {
      id: '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52',
    },
  };
}

test('buildPlatformUserRecord maps VALET aggregate fields into the PlatformUser record', () => {
  const record = buildPlatformUserRecord({
    aggregate: buildAggregate(),
    webhook: buildWebhookPayload(),
    syncedAt: '2026-04-01T12:00:00.000Z',
  });

  assert.equal(record.uid, '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52');
  assert.deepEqual(record.skills, ['TypeScript', 'Firebase']);
  assert.equal(record.workAuthorization, 'US Citizen');
  assert.equal(record.visaSponsorship, 'No');
  assert.equal(record.resumeSummary, 'Platform engineer shipping matching systems.');
  assert.equal(record.totalYearsExperience, 7);
  assert.deepEqual(record.preferences.targetJobTitles, [
    'Software Engineer',
    'Platform Engineer',
  ]);
  assert.equal(record.preferences.jobType, 'intern');
  assert.deepEqual(record.preferences.preferredLocations, ['Chicago, IL', 'Remote']);
  assert.deepEqual(record.preferences.preferredIndustries, ['SaaS', 'AI']);
  assert.equal(record.preferences.remotePreference, 'remote');
  assert.equal(record.preferences.minimumSalary, 120000);
  assert.deepEqual(record.preferences.salaryRange, {
    min: 120000,
    max: 170000,
    currency: 'USD',
  });
  assert.equal(record.preferences.companySizePreference, 'startup');
  assert.equal(record.preferences.sponsorshipNeeded, true);
  assert.equal(record.source.eventType, 'UPDATE');
  assert.ok(record.sourcePayloadHash.length > 10);
});

test('syncPlatformUserFromWebhook skips duplicate deliveries when the payload fingerprint matches', async () => {
  const aggregate = buildAggregate();
  const webhook = buildWebhookPayload();
  const expectedRecord = buildPlatformUserRecord({
    aggregate,
    webhook,
    syncedAt: '2026-04-01T12:00:00.000Z',
  });

  let upserted = false;
  const dependencies: PlatformUserSyncDependencies = {
    source: {
      async getAggregatedUser() {
        return aggregate;
      },
    },
    repository: {
      async getSyncState() {
        return {
          sourcePayloadHash: expectedRecord.sourcePayloadHash,
        };
      },
      async upsert() {
        upserted = true;
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    now: () => new Date('2026-04-01T12:00:00.000Z'),
  };

  const result = await syncPlatformUserFromWebhook(webhook, dependencies);

  assert.equal(result.kind, 'deduplicated');
  assert.equal(result.uid, aggregate.user.id);
  assert.equal(upserted, false);
});

test('extractWebhookUid falls back to user_id for related profile tables', () => {
  assert.equal(
    extractWebhookUid({
      type: 'UPDATE',
      table: 'user_application_profiles',
      schema: 'public',
      record: {
        user_id: '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52',
      },
      old_record: null,
    }),
    '2b2fa3b0-2c0e-4eb8-bab8-f3112ba1bc52',
  );
});

test('extractWebhookUid prefers user_id over row id for resume webhooks', () => {
  assert.equal(
    extractWebhookUid({
      type: 'UPDATE',
      table: 'resumes',
      schema: 'public',
      record: {
        id: 'resume-row-id',
        user_id: 'resume-owner-id',
      },
      old_record: {
        id: 'old-resume-row-id',
        user_id: 'old-resume-owner-id',
      },
    }),
    'resume-owner-id',
  );
});

test('syncPlatformUserFromWebhook accepts resume updates and syncs the owning user aggregate', async () => {
  const aggregate = buildAggregate();
  const upserts: Array<{ uid: string }> = [];
  const dependencies: PlatformUserSyncDependencies = {
    source: {
      async getAggregatedUser(uid) {
        assert.equal(uid, aggregate.user.id);
        return aggregate;
      },
    },
    repository: {
      async getSyncState() {
        return null;
      },
      async upsert(record) {
        upserts.push({ uid: record.uid });
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
    },
    now: () => new Date('2026-04-01T12:00:00.000Z'),
  };

  const result = await syncPlatformUserFromWebhook(
    {
      type: 'UPDATE',
      table: 'resumes',
      schema: 'public',
      record: {
        user_id: aggregate.user.id,
      },
      old_record: {
        user_id: aggregate.user.id,
      },
    },
    dependencies,
  );

  assert.equal(result.kind, 'updated');
  assert.equal(result.uid, aggregate.user.id);
  assert.deepEqual(upserts, [{ uid: aggregate.user.id }]);
});
