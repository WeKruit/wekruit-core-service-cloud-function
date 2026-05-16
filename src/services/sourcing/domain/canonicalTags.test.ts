import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANONICAL_TAGS_SCHEMA_VERSION,
  canonicalRelevantTagsMax,
  canonicalRoleFunctionValues,
  canonicalSkillBucketValues,
  canonicalTagsSchema,
  createEmptyCanonicalTags,
} from './canonicalTags';
import { candidateEnrichmentDraftSchema } from './records';

function validCanonicalEntry(value: string) {
  return {
    value,
    confidence: 0.8,
    evidenceIds: ['evidence_1'],
    mappedFrom: [value],
    mappingSource: 'legacy_enrichment_mapping',
  };
}

test('canonicalTags adapter exposes shared package vocabs without duplicating them', () => {
  assert.equal(canonicalRoleFunctionValues.length, 17);
  assert.ok(canonicalRoleFunctionValues.includes('software_engineering'));
  assert.ok(canonicalSkillBucketValues.includes('programming_languages'));
  assert.equal(canonicalRelevantTagsMax, 12);

  assert.deepEqual(createEmptyCanonicalTags(), {
    schemaVersion: CANONICAL_TAGS_SCHEMA_VERSION,
    roleFunctions: [],
    industrySectors: [],
    careerStage: null,
    relevantTags: [],
    skills: [],
    unmappedLegacyLabels: {},
  });
});

test('canonicalTags schema accepts shared-tags canonical values and rejects noncanonical tokens', () => {
  const parsed = canonicalTagsSchema.parse({
    schemaVersion: CANONICAL_TAGS_SCHEMA_VERSION,
    roleFunctions: [validCanonicalEntry('software_engineering')],
    industrySectors: [validCanonicalEntry('software_and_saas')],
    careerStage: validCanonicalEntry('student'),
    relevantTags: [validCanonicalEntry('developer_tools')],
    skills: [
      {
        name: 'TypeScript',
        bucket: 'programming_languages',
        proficiency: 'advanced',
        confidence: 0.9,
        evidenceIds: ['evidence_1'],
        mappedFrom: ['TypeScript'],
        mappingSource: 'legacy_enrichment_mapping',
      },
    ],
    unmappedLegacyLabels: {
      primaryTrack: ['unknown_other'],
    },
  });

  assert.equal(parsed.roleFunctions[0]?.value, 'software_engineering');
  assert.equal(parsed.industrySectors[0]?.value, 'software_and_saas');
  assert.equal(parsed.skills[0]?.name, 'typescript');

  assert.throws(
    () =>
      canonicalTagsSchema.parse({
        schemaVersion: CANONICAL_TAGS_SCHEMA_VERSION,
        roleFunctions: [validCanonicalEntry('swe')],
      }),
    /roleFunction/,
  );
  assert.throws(
    () =>
      canonicalTagsSchema.parse({
        schemaVersion: CANONICAL_TAGS_SCHEMA_VERSION,
        skills: [
          {
            name: 'ts',
            bucket: 'programming_languages',
            proficiency: 'advanced',
            confidence: 0.9,
            evidenceIds: ['evidence_1'],
            mappingSource: 'legacy_enrichment_mapping',
          },
        ],
      }),
    /abbreviation/,
  );
});

test('candidate enrichment drafts can carry canonicalTags additively', () => {
  const draft = candidateEnrichmentDraftSchema.parse({
    schemaVersion: 'candidate-enrichment-draft-v1',
    primaryTrack: 'software_engineering',
    scoredTracks: [
      {
        track: 'software_engineering',
        score: 0.9,
        evidenceIds: ['evidence_1'],
      },
    ],
    specializations: [],
    skills: [],
    industryDomainInterests: [],
    careerStage: {
      value: 'student',
      confidence: 0.8,
      evidenceIds: ['evidence_1'],
    },
    contactability: {
      value: 'medium',
      confidence: 0.6,
      evidenceIds: ['evidence_1'],
    },
    matchingSummary: 'Strong software engineering signal.',
    fieldEvidence: {},
    proposedTags: [],
    canonicalTags: createEmptyCanonicalTags(),
  });

  assert.equal(draft.canonicalTags?.schemaVersion, CANONICAL_TAGS_SCHEMA_VERSION);
  assert.equal(draft.primaryTrack, 'software_engineering');
});
