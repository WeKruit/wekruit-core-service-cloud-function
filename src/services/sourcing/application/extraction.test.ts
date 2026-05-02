import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNameInstitutionKey,
  extractEvidenceFromSourceRecord,
  normalizeUrl,
} from './extraction';
import type { SourceRecord } from '../domain/records';

function buildSourceRecord(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: 'src_github_person_ada',
    sourceRunId: 'phase1-run',
    sourceName: 'github',
    sourceDomain: 'developer',
    pipelineName: 'phase1-test',
    entityType: 'person',
    sourceNativeId: 'ada-dev',
    sourceUrl: 'https://github.com/ada-dev',
    displayName: 'Ada Dev',
    institution: 'Analytical Engine Lab',
    rawSummary: {
      email: 'ADA@example.com',
      homepage: 'https://ada.example.com/',
    },
    display: {
      github: 'https://github.com/ada-dev/',
      institution: 'Analytical Engine Lab',
    },
    raw: {},
    nameInstitutionKey: 'ada dev::analytical engine lab',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

test('normalizeUrl removes hashes and trailing slashes before lowercasing', () => {
  assert.equal(normalizeUrl('https://GitHub.com/Ada-Dev/#readme'), 'https://github.com/ada-dev');
});

test('buildNameInstitutionKey normalizes accents, case, punctuation, and spacing', () => {
  assert.equal(
    buildNameInstitutionKey('  Łukasz   Kaiser ', 'Google (United States)'),
    'łukasz kaiser::google united states',
  );
});

test('extractEvidenceFromSourceRecord emits normalized identity evidence with provenance', () => {
  const evidence = extractEvidenceFromSourceRecord(buildSourceRecord(), '2026-04-28T00:00:00.000Z');
  const byType = new Map(evidence.map((entry) => [entry.evidenceType, entry]));

  assert.equal(byType.get('email')?.normalizedValue, 'ada@example.com');
  assert.equal(byType.get('github')?.normalizedValue, 'https://github.com/ada-dev');
  assert.equal(byType.get('source_native_id')?.normalizedValue, 'github:ada-dev');
  assert.equal(byType.get('institution')?.normalizedValue, 'analytical engine lab');
  assert.equal(byType.get('name')?.normalizedValue, 'ada dev');
  assert.equal(byType.get('github')?.extractedFrom.sourceUrl, 'https://github.com/ada-dev');
  assert.ok(evidence.every((entry) => entry.sourceRecordId === 'src_github_person_ada'));
});

test('extractEvidenceFromSourceRecord ignores shared project links as person identity evidence', () => {
  const evidence = extractEvidenceFromSourceRecord(
    buildSourceRecord({
      id: 'src_devpost_person_ada',
      sourceName: 'devpost',
      sourceDomain: 'hackathon',
      sourceNativeId: 'https://devpost.com/ada-dev',
      sourceUrl: 'https://devpost.com/ada-dev',
      display: {
        github: 'https://github.com/ada-dev',
        website: 'https://ada.example.com',
      },
      rawSummary: {
        projectUrls: ['https://devpost.com/software/shared-project'],
        projectGithubRepos: ['https://github.com/team/shared-project'],
        demoLinks: ['https://shared-demo.example.com'],
        allLinks: ['https://github.com/team/shared-project', 'https://shared-demo.example.com'],
      },
      raw: {
        projects: [
          {
            projectUrl: 'https://devpost.com/software/shared-project',
            projectGithubRepos: ['https://github.com/team/shared-project'],
            demoLinks: ['https://shared-demo.example.com'],
          },
        ],
      },
    }),
    '2026-04-28T00:00:00.000Z',
  );

  const values = evidence.map((entry) => entry.normalizedValue);

  assert.ok(values.includes('https://github.com/ada-dev'));
  assert.ok(values.includes('https://ada.example.com'));
  assert.ok(!values.includes('https://github.com/team/shared-project'));
  assert.ok(!values.includes('https://devpost.com/software/shared-project'));
  assert.ok(!values.includes('https://shared-demo.example.com'));
});
