import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEvidenceDedupCandidate,
  buildNameInstitutionDedupCandidate,
  buildSingletonReviewCandidate,
} from './dedup';
import { extractEvidenceFromSourceRecord } from './extraction';
import type { SourceRecord } from '../domain/records';

function buildPersonRecord(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: 'src_openalex_person_a1',
    sourceRunId: 'phase1-run',
    sourceName: 'openalex',
    sourceDomain: 'researcher',
    pipelineName: 'phase1-test',
    entityType: 'person_profile',
    sourceNativeId: 'A1',
    sourceUrl: 'https://openalex.org/A1',
    displayName: 'Ada Lovelace',
    institution: 'Analytical Engine Lab',
    rawSummary: {
      orcid: '0000-0001-1111-1111',
    },
    display: {
      name: 'Ada Lovelace',
      institution: 'Analytical Engine Lab',
    },
    raw: {},
    nameInstitutionKey: 'ada lovelace::analytical engine lab',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

test('buildSingletonReviewCandidate creates pending review candidates for person records only', () => {
  const record = buildPersonRecord();
  const evidence = extractEvidenceFromSourceRecord(record, '2026-04-28T00:00:00.000Z');
  const candidate = buildSingletonReviewCandidate({
    sourceRecord: record,
    evidence,
    now: '2026-04-28T00:00:00.000Z',
  });

  assert.ok(candidate);
  assert.equal(candidate.status, 'pending_review');
  assert.equal(candidate.strength, 'weak');
  assert.deepEqual(candidate.reasonCodes, ['singleton_review']);
  assert.deepEqual(candidate.sourceRecordIds, ['src_openalex_person_a1']);

  assert.equal(
    buildSingletonReviewCandidate({
      sourceRecord: buildPersonRecord({ entityType: 'research_work' }),
      evidence,
      now: '2026-04-28T00:00:00.000Z',
    }),
    null,
  );
});

test('buildEvidenceDedupCandidate creates strong exact-match candidates from shared ORCID evidence', () => {
  const openalexRecord = buildPersonRecord();
  const contactRecord = buildPersonRecord({
    id: 'src_contact_person_a1',
    sourceName: 'contact_enrichment',
    sourceNativeId: 'A1-contact',
    sourceUrl: undefined,
  });
  const allEvidence = [
    ...extractEvidenceFromSourceRecord(openalexRecord, '2026-04-28T00:00:00.000Z'),
    ...extractEvidenceFromSourceRecord(contactRecord, '2026-04-28T00:00:00.000Z'),
  ];
  const seed = allEvidence.find((entry) => entry.evidenceType === 'orcid');
  assert.ok(seed);

  const candidate = buildEvidenceDedupCandidate({
    seed,
    matchingEvidence: allEvidence.filter((entry) => entry.valueHash === seed.valueHash),
    recordsById: new Map([
      [openalexRecord.id, openalexRecord],
      [contactRecord.id, contactRecord],
    ]),
    now: '2026-04-28T00:00:00.000Z',
  });

  assert.ok(candidate);
  assert.equal(candidate.status, 'pending_review');
  assert.equal(candidate.strength, 'strong');
  assert.deepEqual(candidate.reasonCodes, ['orcid_exact']);
  assert.deepEqual(candidate.sourceRecordIds, ['src_contact_person_a1', 'src_openalex_person_a1']);
});

test('buildEvidenceDedupCandidate excludes non-person records from person dedup groups', () => {
  const githubRecord = buildPersonRecord({
    id: 'src_github_person_alex',
    sourceName: 'github',
    entityType: 'person',
    sourceNativeId: 'alex',
    sourceUrl: 'https://github.com/alex',
    displayName: 'Alex Rivera',
    rawSummary: {
      github: 'https://github.com/alex',
    },
    display: {
      name: 'Alex Rivera',
      github: 'https://github.com/alex',
    },
  });
  const devpostPersonRecord = buildPersonRecord({
    id: 'src_devpost_person_alex',
    sourceName: 'devpost',
    entityType: 'person',
    sourceNativeId: 'https://devpost.com/alex',
    sourceUrl: 'https://devpost.com/alex',
    displayName: 'Alex Rivera',
    rawSummary: {
      github: 'https://github.com/alex',
    },
    display: {
      name: 'Alex Rivera',
      github: 'https://github.com/alex',
    },
  });
  const devpostProjectRecord = buildPersonRecord({
    id: 'src_devpost_project_demo',
    sourceName: 'devpost',
    entityType: 'project',
    sourceNativeId: 'https://devpost.com/software/demo',
    sourceUrl: 'https://devpost.com/software/demo',
    displayName: 'Demo Project',
    rawSummary: {},
    display: {
      title: 'Demo Project',
    },
    raw: {
      members: [
        {
          name: 'Alex Rivera',
          github_url: 'https://github.com/alex',
        },
      ],
    },
  });
  const allEvidence = [
    ...extractEvidenceFromSourceRecord(githubRecord, '2026-04-28T00:00:00.000Z'),
    ...extractEvidenceFromSourceRecord(devpostPersonRecord, '2026-04-28T00:00:00.000Z'),
    ...extractEvidenceFromSourceRecord(devpostProjectRecord, '2026-04-28T00:00:00.000Z'),
  ];
  const seed = allEvidence.find(
    (entry) => entry.sourceRecordId === githubRecord.id && entry.evidenceType === 'github',
  );
  assert.ok(seed);

  const candidate = buildEvidenceDedupCandidate({
    seed,
    matchingEvidence: allEvidence.filter((entry) => entry.valueHash === seed.valueHash),
    recordsById: new Map([
      [githubRecord.id, githubRecord],
      [devpostPersonRecord.id, devpostPersonRecord],
      [devpostProjectRecord.id, devpostProjectRecord],
    ]),
    now: '2026-04-28T00:00:00.000Z',
  });

  assert.ok(candidate);
  assert.equal(candidate.strength, 'strong');
  assert.deepEqual(candidate.sourceRecordIds, ['src_devpost_person_alex', 'src_github_person_alex']);
});

test('buildNameInstitutionDedupCandidate groups same name and institution as weak evidence', () => {
  const first = buildPersonRecord();
  const second = buildPersonRecord({
    id: 'src_contact_person_a1',
    sourceName: 'contact_enrichment',
    sourceNativeId: 'A1-contact',
  });
  const evidence = [
    ...extractEvidenceFromSourceRecord(first, '2026-04-28T00:00:00.000Z'),
    ...extractEvidenceFromSourceRecord(second, '2026-04-28T00:00:00.000Z'),
  ];

  const candidate = buildNameInstitutionDedupCandidate({
    nameInstitutionKey: 'ada lovelace::analytical engine lab',
    sourceRunId: 'phase1-run',
    matchingRecords: [first, second],
    evidence,
    now: '2026-04-28T00:00:00.000Z',
  });

  assert.ok(candidate);
  assert.equal(candidate.strength, 'weak');
  assert.deepEqual(candidate.reasonCodes, ['name_institution']);
  assert.deepEqual(candidate.sourceRecordIds, ['src_contact_person_a1', 'src_openalex_person_a1']);
  assert.ok(candidate.evidenceIds.length >= 2);
});
