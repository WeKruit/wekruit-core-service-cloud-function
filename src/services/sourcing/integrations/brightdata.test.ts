import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BrightDataLinkedInProvider,
  FakeProfessionalProfileLookupProvider,
  brightDataLinkedInProfilesDatasetId,
} from './brightdata';

test('FakeProfessionalProfileLookupProvider returns only normalized allowed profile fields', async () => {
  const provider = new FakeProfessionalProfileLookupProvider({
    'https://www.linkedin.com/in/spencerwang1': {
      url: 'https://www.linkedin.com/in/spencerwang1?trk=public_profile',
      name: 'Spencer Wang',
      position: 'Synthetic builder '.repeat(30),
      current_company: {
        name: 'WeKruit Test Fixture',
      },
      city: 'San Francisco Bay Area',
      country_code: 'US',
      about: 'Professional summary '.repeat(80),
      experience: Array.from({ length: 12 }, (_, index) => ({
        title: `Role ${index}`,
        company_name: `Company ${index}`,
      })),
      education: Array.from({ length: 10 }, (_, index) => ({
        school: `School ${index}`,
        degree: `Degree ${index}`,
      })),
      skills: Array.from({ length: 25 }, (_, index) => `Skill ${index}`),
      projects: Array.from({ length: 9 }, (_, index) => ({
        title: `Project ${index}`,
      })),
      publications: [
        {
          title: 'Publication should fit only if room remains',
        },
      ],
      email: 'do-not-store@example.com',
      phone: '+1-555-000-0000',
      contact_info: {
        email: 'also-do-not-store@example.com',
      },
    },
  });

  const result = await provider.lookupLinkedInProfile({
    linkedinUrl: 'https://www.linkedin.com/in/SpencerWang1/',
  });
  const profile = result.matches[0]?.normalizedProfile;

  assert.equal(result.status, 'completed');
  assert.ok(profile);
  assert.deepEqual(Object.keys(profile).sort(), [
    'aboutSummary',
    'currentCompany',
    'educationSummary',
    'experienceSummary',
    'headline',
    'location',
    'name',
    'profileUrl',
    'projectsPublications',
    'skills',
  ]);
  assert.equal(profile.profileUrl, 'https://www.linkedin.com/in/spencerwang1');
  assert.equal(profile.experienceSummary.length, 8);
  assert.equal(profile.educationSummary.length, 8);
  assert.equal(profile.skills.length, 20);
  assert.equal(profile.projectsPublications.length, 8);
  assert.ok((profile.headline?.length ?? 0) <= 240);
  assert.ok((profile.aboutSummary?.length ?? 0) <= 900);
  assert.equal('email' in profile, false);
  assert.equal(JSON.stringify(profile).includes('do-not-store@example.com'), false);
});

test('BrightDataLinkedInProvider builds the sync LinkedIn scraper request safely', async () => {
  const captured: {
    url?: string;
    init?: { method: string; headers: Record<string, string>; body?: string };
  } = {};
  const provider = new BrightDataLinkedInProvider({
    apiKey: 'test-brightdata-key',
    baseUrl: 'https://api.brightdata.test',
    fetchImpl: async (url, init) => {
      captured.url = url;
      captured.init = init;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify([
            {
              id: 'provider-row-1',
              url: 'https://www.linkedin.com/in/spencerwang1',
              name: 'Spencer Wang',
              position: 'Synthetic provider response',
              current_company: {
                name: 'WeKruit Test Fixture',
              },
            },
          ]),
      };
    },
  });

  const result = await provider.lookupLinkedInProfile({
    linkedinUrl: 'https://www.linkedin.com/in/SpencerWang1/?trk=public_profile',
  });

  assert.ok(captured.init);
  assert.equal(
    captured.url,
    `https://api.brightdata.test/datasets/v3/scrape?dataset_id=${brightDataLinkedInProfilesDatasetId}&format=json`,
  );
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.Authorization, 'Bearer test-brightdata-key');
  assert.equal(captured.init.headers['Content-Type'], 'application/json');
  assert.equal(captured.init.body, JSON.stringify([{ url: 'https://www.linkedin.com/in/spencerwang1' }]));
  assert.equal(result.provider, 'brightdata');
  assert.equal(result.datasetId, brightDataLinkedInProfilesDatasetId);
  assert.equal(result.inputUrl, 'https://www.linkedin.com/in/spencerwang1');
  assert.equal(result.status, 'completed');
  assert.equal(result.matches[0]?.providerRecordId, 'provider-row-1');
  assert.equal(JSON.stringify(result).includes('test-brightdata-key'), false);
});

test('BrightDataLinkedInProvider preserves sync-to-async snapshot responses', async () => {
  const provider = new BrightDataLinkedInProvider({
    apiKey: 'test-brightdata-key',
    baseUrl: 'https://api.brightdata.test',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ snapshot_id: 's_phase65b_snapshot' }),
    }),
  });

  const result = await provider.lookupLinkedInProfile({
    linkedinUrl: 'https://www.linkedin.com/in/spencerwang1',
  });

  assert.equal(result.status, 'async_snapshot_pending');
  assert.equal(result.snapshotId, 's_phase65b_snapshot');
  assert.deepEqual(result.matches, []);
});

test('BrightDataLinkedInProvider returns no_match for an empty JSON response array', async () => {
  const provider = new BrightDataLinkedInProvider({
    apiKey: 'test-brightdata-key',
    baseUrl: 'https://api.brightdata.test',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([]),
    }),
  });

  const result = await provider.lookupLinkedInProfile({
    linkedinUrl: 'https://www.linkedin.com/in/spencerwang1',
  });

  assert.equal(result.status, 'no_match');
  assert.deepEqual(result.matches, []);
});
