import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BrightDataLinkedInProvider,
  FakeProfessionalProfileLookupProvider,
  brightDataLinkedInProfilesDatasetId,
  normalizeBrightDataLinkedInProfile,
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
  assert.equal(profile.experienceSummary.length, 10);
  assert.equal(profile.educationSummary.length, 10);
  assert.equal(profile.skills.length, 25);
  assert.equal(profile.projectsPublications.length, 10);
  assert.ok((profile.headline?.length ?? 0) <= 280);
  assert.ok((profile.aboutSummary?.length ?? 0) <= 2500);
  assert.equal('email' in profile, false);
  assert.equal(JSON.stringify(profile).includes('do-not-store@example.com'), false);
});

test('normalizeBrightDataLinkedInProfile preserves rich allowed public context', () => {
  const profile = normalizeBrightDataLinkedInProfile(
    {
      id: 'provider-row-rich',
      url: 'https://www.linkedin.com/in/spencerwang1?trk=public_profile',
      name: 'Spencer &amp; Wang',
      position: 'Founder &amp; builder',
      current_company: {
        name: 'WeKruit &amp; Co',
        link: 'https://www.linkedin.com/company/wekruit',
        location: 'Los Angeles',
      },
      city: 'Los Angeles',
      country_code: 'US',
      about: 'Builds sourcing systems &amp; enrichment workflows. '.repeat(35),
      experience: [
        {
          title: 'Founding Engineer',
          company: 'WeKruit',
          start_date: '2024',
          end_date: 'Present',
          location: 'Los Angeles',
          description_html:
            '<p>Built <strong>candidate enrichment</strong>, reviewer workflows, and project matching using Bright Data &amp; OpenAI.</p>',
          company_linkedin_url: 'https://www.linkedin.com/company/wekruit',
        },
        {
          title: 'Researcher',
          company_name: 'UCLA AI Lab',
          starts_at: { year: 2022, month: 9 },
          ends_at: { year: 2024, month: 6 },
          subtitle: 'Human-in-the-loop systems',
          description: 'Worked on retrieval systems for evidence-grounded review.',
        },
      ],
      education: [
        {
          school: 'UCLA Henry Samueli School of Engineering and Applied Science',
          degree: 'BS',
          field: 'Computer Science',
          start_date: '2021',
          end_date: '2025',
          description: 'Coursework in systems, databases, and product engineering.',
        },
      ],
      skills: [{ name: 'TypeScript' }, 'Product systems'],
      projects: [
        {
          name: 'Tempo',
          description: 'Hackathon-winning scheduling assistant with real-time collaboration.',
          url: 'https://tempo.example.test',
        },
        {
          title: 'MindForce',
          description_html: '<div>BCI project &amp; accessibility tooling for hands-free workflows.</div>',
          project_url: 'https://mindforce.example.test',
        },
      ],
      publications: [
        {
          publication_title: 'Evidence-Grounded Candidate Enrichment',
          description: 'A paper about using approved professional evidence in profile enrichment.',
          url: 'https://papers.example.test/enrichment',
        },
      ],
      patents: [
        {
          patent_title: 'Workflow Review Assistant',
          description: 'Public patent-like fixture for professional context.',
          patent_url: 'https://patents.example.test/review-assistant',
        },
      ],
      email: 'do-not-store@example.com',
      phone: '+1-555-000-0000',
      contact_info: {
        email: 'also-do-not-store@example.com',
      },
      people_also_viewed: [
        {
          name: 'Do Not Store',
          profile_link: 'https://www.linkedin.com/in/do-not-store',
        },
      ],
      avatar: 'https://media.example.test/avatar.png',
      followers: 100000,
    },
    'https://www.linkedin.com/in/spencerwang1',
  );

  const serialized = JSON.stringify(profile);
  assert.equal(profile.profileUrl, 'https://www.linkedin.com/in/spencerwang1');
  assert.equal(profile.name, 'Spencer & Wang');
  assert.equal(profile.headline, 'Founder & builder');
  assert.ok(profile.currentCompany?.includes('WeKruit & Co'));
  assert.ok(profile.currentCompany?.includes('https://www.linkedin.com/company/wekruit'));
  assert.ok((profile.aboutSummary?.length ?? 0) > 900);
  assert.equal(profile.aboutSummary?.includes('&amp;'), false);
  assert.ok(profile.experienceSummary[0]?.includes('Founding Engineer'));
  assert.ok(profile.experienceSummary[0]?.includes('candidate enrichment'));
  assert.ok(profile.experienceSummary[0]?.includes('Bright Data & OpenAI'));
  assert.ok(profile.experienceSummary[0]?.includes('https://www.linkedin.com/company/wekruit'));
  assert.ok(profile.experienceSummary[1]?.includes('2022-9 - 2024-6'));
  assert.ok(profile.educationSummary[0]?.includes('Coursework in systems'));
  assert.ok(profile.projectsPublications.some((entry) =>
    entry.includes('Tempo') && entry.includes('real-time collaboration') && entry.includes('https://tempo.example.test'),
  ));
  assert.ok(profile.projectsPublications.some((entry) =>
    entry.includes('MindForce') && entry.includes('accessibility tooling') && entry.includes('https://mindforce.example.test'),
  ));
  assert.ok(profile.projectsPublications.some((entry) => entry.includes('Evidence-Grounded Candidate Enrichment')));
  assert.ok(profile.projectsPublications.some((entry) => entry.includes('Workflow Review Assistant')));
  assert.equal(serialized.includes('do-not-store@example.com'), false);
  assert.equal(serialized.includes('+1-555-000-0000'), false);
  assert.equal(serialized.includes('people_also_viewed'), false);
  assert.equal(serialized.includes('avatar.png'), false);
  assert.equal(serialized.includes('100000'), false);
});

test('normalizeBrightDataLinkedInProfile reads documented Bright Data aliases without raw retention', () => {
  const profile = normalizeBrightDataLinkedInProfile(
    {
      input_url: 'https://www.linkedin.com/in/spencerwang1/',
      first_name: 'Spencer',
      last_name: 'Wang',
      occupation: 'Founder and product engineer',
      current_company: null,
      current_company_name: 'WeKruit',
      location: 'Los Angeles',
      about: null,
      about_html: '<p>Builds reviewer-centered sourcing and enrichment systems.</p>',
      experience: null,
      experiences: [
        {
          title: 'Founder',
          company_name: 'WeKruit',
          description_html: '<div>Designs and ships candidate sourcing workflows with human review.</div>',
        },
      ],
      volunteer_experience: [
        {
          role: 'Hackathon mentor',
          organization: 'Synthetic Builder Club',
          description: 'Helped teams scope product demos and technical architecture.',
        },
      ],
      education: null,
      educations_details: 'UCLA Henry Samueli School of Engineering and Applied Science',
      skill: ['TypeScript'],
      activity: [
        {
          post_text: 'Should not be stored in normalized profile without a field policy decision.',
        },
      ],
    },
    'https://www.linkedin.com/in/spencerwang1',
  );

  const serialized = JSON.stringify(profile);
  assert.equal(profile.profileUrl, 'https://www.linkedin.com/in/spencerwang1');
  assert.equal(profile.name, 'Spencer Wang');
  assert.equal(profile.headline, 'Founder and product engineer');
  assert.equal(profile.currentCompany, 'WeKruit');
  assert.deepEqual(profile.educationSummary, ['UCLA Henry Samueli School of Engineering and Applied Science']);
  assert.ok(profile.experienceSummary.some((entry) => entry.includes('candidate sourcing workflows')));
  assert.ok(profile.experienceSummary.some((entry) => entry.includes('Hackathon mentor')));
  assert.deepEqual(profile.skills, ['TypeScript']);
  assert.equal(profile.aboutSummary, 'Builds reviewer-centered sourcing and enrichment systems.');
  assert.equal(serialized.includes('post_text'), false);
  assert.equal(serialized.includes('field policy decision'), false);
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
  assert.equal(captured.init.body, JSON.stringify({ input: [{ url: 'https://www.linkedin.com/in/spencerwang1' }] }));
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

test('BrightDataLinkedInProvider refreshes pending snapshots and downloads ready snapshots', async () => {
  const capturedUrls: string[] = [];
  const provider = new BrightDataLinkedInProvider({
    apiKey: 'test-brightdata-key',
    baseUrl: 'https://api.brightdata.test',
    fetchImpl: async (url) => {
      capturedUrls.push(url);
      if (url.includes('/progress/s_pending')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ snapshot_id: 's_pending', status: 'running' }),
        };
      }
      if (url.includes('/progress/s_ready')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ snapshot_id: 's_ready', status: 'ready' }),
        };
      }
      if (url.includes('/snapshot/s_ready')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([
              {
                id: 'snapshot-row-1',
                url: 'https://www.linkedin.com/in/spencerwang1',
                name: 'Spencer Wang',
                position: 'Synthetic snapshot response',
              },
            ]),
        };
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const pending = await provider.refreshLinkedInProfileSnapshot?.({
    linkedinUrl: 'https://www.linkedin.com/in/spencerwang1',
    snapshotId: 's_pending',
  });
  const ready = await provider.refreshLinkedInProfileSnapshot?.({
    linkedinUrl: 'https://www.linkedin.com/in/spencerwang1',
    snapshotId: 's_ready',
  });

  assert.equal(pending?.status, 'async_snapshot_pending');
  assert.equal(pending?.snapshotId, 's_pending');
  assert.equal(ready?.status, 'completed');
  assert.equal(ready?.matches[0]?.providerRecordId, 'snapshot-row-1');
  assert.deepEqual(capturedUrls, [
    'https://api.brightdata.test/datasets/v3/progress/s_pending',
    'https://api.brightdata.test/datasets/v3/progress/s_ready',
    'https://api.brightdata.test/datasets/v3/snapshot/s_ready?format=json',
  ]);
});
