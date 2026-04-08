import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreFeedbackBoost, scoreJob, scoreRecency, scoreSkillsOverlap, scoreTitleSimilarity, WEIGHTS } from './scoring';
import type { MatchingJobRecord } from '../domain/job';
import type { PlatformUserRecord } from '../domain/platformUser';

function buildJob(): MatchingJobRecord {
  return {
    id: 'job-1',
    sourceRepo: 'Summer2026-Internships',
    jobType: 'intern',
    companyName: 'Acme',
    roleTitle: 'Software Engineer Intern',
    primaryUrl: 'https://jobs.example/job-1',
    atsApplyUrl: null,
    locationRaw: 'Remote',
    datePostedRaw: '1d',
    status: 'active',
    contentHash: 'hash-1',
    jobDescription: 'Build product features.',
    coreResponsibilities: ['Ship code'],
    salaryRange: '$120k-$140k',
    salaryMin: 120000,
    salaryMax: 140000,
    seniorityLevel: 'entry',
    benefits: ['Health'],
    qualifications: ['TypeScript'],
    industry: 'Software',
    companySize: 'startup',
    requiredSkills: ['TypeScript', 'Firebase'],
    requiredSkillsIndex: ['typescript', 'firebase'],
    locationBuckets: ['remote'],
    searchTokens: ['acme', 'software', 'engineer'],
    industryKey: 'software',
    sponsorship: true,
    embedding: [1, 0, 0],
    embeddingModel: 'text-embedding-3-small',
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    enrichedAt: new Date().toISOString(),
    embeddedAt: new Date().toISOString(),
    syncedAt: new Date().toISOString(),
  };
}

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
      preferredLocations: ['Remote'],
      preferredIndustries: ['Software'],
      remotePreference: 'remote',
      excludedCompanies: [],
      minimumSalary: 100000,
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
    syncedAt: new Date().toISOString(),
    source: {
      eventType: 'INSERT',
      table: 'users',
      schema: 'public',
      usersUpdatedAt: new Date().toISOString(),
      applicationProfileUpdatedAt: new Date().toISOString(),
      defaultResumeParsedAt: new Date().toISOString(),
    },
  };
}

test('matching scorer weights still sum to one', () => {
  assert.equal(Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0), 1);
});

test('scoreTitleSimilarity returns 1.0 for identical vectors', () => {
  assert.ok(Math.abs(scoreTitleSimilarity([1, 0, 0], [1, 0, 0]) - 1) < 1e-6);
});

test('scoreSkillsOverlap matches the Python coverage-dominant formula', () => {
  assert.equal(scoreSkillsOverlap(['python'], ['python', 'sql']), 0.575);
});

test('scoreRecency decays to zero after 30 days', () => {
  const now = new Date('2026-04-30T00:00:00.000Z');
  assert.equal(scoreRecency('2026-03-01T00:00:00.000Z', now), 0);
});

test('scoreFeedbackBoost treats liked companies as positive and disliked companies as negative', () => {
  assert.equal(
    scoreFeedbackBoost('Acme', {
      likedCompanies: ['Acme'],
      dislikedCompanies: [],
    }),
    1,
  );
  assert.equal(
    scoreFeedbackBoost('Acme', {
      likedCompanies: [],
      dislikedCompanies: ['Acme'],
    }),
    0,
  );
});

test('scoreJob returns a composite score with seven signals and matched skills', () => {
  const result = scoreJob({
    job: buildJob(),
    profile: buildProfile(),
    feedbackSignals: {
      likedCompanies: ['Acme'],
      dislikedCompanies: [],
    },
    queryEmbedding: [1, 0, 0],
    now: new Date('2026-04-01T00:00:00.000Z'),
  });

  assert.equal(result.signals.feedbackBoost, 1);
  assert.equal(result.signals.locationFit, 1);
  assert.deepEqual(result.matchedSkills, ['TypeScript']);
  assert.ok(result.score > 0.8);
});
