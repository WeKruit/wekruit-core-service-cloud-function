import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canonicalTagsSchema,
  type CanonicalTags,
} from './canonicalTags';
import { mapEnrichmentDraftToCanonicalTags } from './canonicalTagMapping';
import {
  candidateCareerStageValues,
  candidateIndustryDomainValues,
  candidateSpecializationValues,
  candidateTrackValues,
  type CandidateCareerStage,
  type CandidateEnrichmentDraft,
  type CandidateIndustryDomain,
  type CandidateTrack,
} from './records';

function buildDraft(overrides: Partial<CandidateEnrichmentDraft> = {}): CandidateEnrichmentDraft {
  return {
    schemaVersion: 'candidate-enrichment-draft-v1',
    primaryTrack: 'software_engineering',
    scoredTracks: [
      {
        track: 'software_engineering',
        score: 0.9,
        evidenceIds: ['evidence_track'],
      },
    ],
    specializations: [],
    skills: [],
    industryDomainInterests: [],
    careerStage: {
      value: 'unknown',
      confidence: 0.2,
      evidenceIds: [],
    },
    contactability: {
      value: 'high',
      confidence: 0.8,
      evidenceIds: ['evidence_contact'],
    },
    matchingSummary: 'Mapping test draft.',
    fieldEvidence: {},
    proposedTags: [],
    warnings: [],
    ...overrides,
  };
}

function values<T extends { value: string }>(entries: T[]): string[] {
  return entries.map((entry) => entry.value);
}

test('mapEnrichmentDraftToCanonicalTags maps tricky legacy labels conservatively', () => {
  const canonicalTags = mapEnrichmentDraftToCanonicalTags(buildDraft({
    primaryTrack: 'ai_research',
    scoredTracks: [
      {
        track: 'ai_research',
        score: 0.91,
        evidenceIds: ['evidence_ai_research'],
      },
      {
        track: 'academic_research',
        score: 0.74,
        evidenceIds: ['evidence_academic_research'],
      },
      {
        track: 'business_founder',
        score: 0.64,
        evidenceIds: ['evidence_founder'],
      },
    ],
    specializations: [
      {
        specialization: 'natural_language_processing',
        confidence: 0.8,
        evidenceIds: ['evidence_nlp'],
      },
    ],
    industryDomainInterests: [
      {
        domain: 'healthcare_ai',
        confidence: 0.75,
        evidenceIds: ['evidence_healthcare_ai'],
      },
      {
        domain: 'ai_infrastructure',
        confidence: 0.7,
        evidenceIds: ['evidence_ai_infrastructure'],
      },
      {
        domain: 'open_source',
        confidence: 0.6,
        evidenceIds: ['evidence_open_source'],
      },
    ],
    careerStage: {
      value: 'academic_researcher',
      confidence: 0.8,
      evidenceIds: ['evidence_academic_stage'],
    },
    skills: [
      {
        skill: 'TypeScript',
        confidence: 0.9,
        evidenceIds: ['evidence_typescript'],
      },
      {
        skill: 'ts',
        confidence: 0.4,
        evidenceIds: ['evidence_ts_abbreviation'],
      },
    ],
  }));

  assert.deepEqual(values(canonicalTags.roleFunctions), []);
  assert.deepEqual(values(canonicalTags.industrySectors), [
    'artificial_intelligence_and_machine_learning',
    'research_and_academia',
    'healthcare_and_life_sciences',
  ]);
  assert.deepEqual(canonicalTags.industrySectors[0]?.evidenceIds, [
    'evidence_ai_infrastructure',
    'evidence_ai_research',
    'evidence_healthcare_ai',
  ]);
  assert.equal(canonicalTags.industrySectors[0]?.confidence, 0.91);
  assert.equal(canonicalTags.careerStage?.value, 'founder');
  assert.deepEqual(canonicalTags.careerStage?.evidenceIds, ['evidence_founder']);
  assert.deepEqual(values(canonicalTags.relevantTags), [
    'artificial_intelligence_research',
    'academic_research',
    'startup_founder',
    'natural_language_processing',
    'healthcare_artificial_intelligence',
    'artificial_intelligence_infrastructure',
    'open_source',
    'academic_researcher',
  ]);
  assert.equal(canonicalTags.skills[0]?.name, 'typescript');
  assert.equal(canonicalTags.skills[0]?.bucket, 'programming_languages');
  assert.deepEqual(canonicalTags.skills[0]?.evidenceIds, ['evidence_typescript']);
  assert.deepEqual(canonicalTags.unmappedLegacyLabels.skills, ['ts']);
  assert.equal(canonicalTags.unmappedLegacyLabels.contactability, undefined);
});

test('mapEnrichmentDraftToCanonicalTags keeps unknown legacy labels out of canonical fields', () => {
  const canonicalTags = mapEnrichmentDraftToCanonicalTags(buildDraft({
    primaryTrack: 'unknown_other',
    scoredTracks: [
      {
        track: 'unknown_other',
        score: 0.2,
        evidenceIds: [],
      },
    ],
    specializations: [
      {
        specialization: 'unknown_other',
        confidence: 0.2,
        evidenceIds: [],
      },
    ],
    industryDomainInterests: [
      {
        domain: 'unknown_other',
        confidence: 0.2,
        evidenceIds: [],
      },
    ],
    careerStage: {
      value: 'unknown',
      confidence: 0.2,
      evidenceIds: [],
    },
  }));

  assert.deepEqual(canonicalTags.roleFunctions, []);
  assert.deepEqual(canonicalTags.industrySectors, []);
  assert.equal(canonicalTags.careerStage, null);
  assert.deepEqual(canonicalTags.relevantTags, []);
  assert.deepEqual(canonicalTags.unmappedLegacyLabels, {
    careerStage: ['unknown'],
    industryDomainInterests: ['unknown_other'],
    scoredTracks: ['unknown_other'],
    specializations: ['unknown_other'],
  });
});

test('all configured legacy mappings parse against the real shared-tags-backed schema', () => {
  const mappedResults: CanonicalTags[] = [];

  for (const track of candidateTrackValues) {
    mappedResults.push(mapEnrichmentDraftToCanonicalTags(buildDraft({
      primaryTrack: track,
      scoredTracks: [
        {
          track,
          score: 0.8,
          evidenceIds: track === 'unknown_other' ? [] : [`evidence_track_${track}`],
        },
      ],
    })));
  }

  for (const specialization of candidateSpecializationValues) {
    mappedResults.push(mapEnrichmentDraftToCanonicalTags(buildDraft({
      specializations: [
        {
          specialization,
          confidence: 0.8,
          evidenceIds: specialization === 'unknown_other' ? [] : [`evidence_specialization_${specialization}`],
        },
      ],
    })));
  }

  for (const domain of candidateIndustryDomainValues) {
    mappedResults.push(mapEnrichmentDraftToCanonicalTags(buildDraft({
      industryDomainInterests: [
        {
          domain,
          confidence: 0.8,
          evidenceIds: domain === 'unknown_other' ? [] : [`evidence_domain_${domain}`],
        },
      ],
    })));
  }

  for (const stage of candidateCareerStageValues) {
    mappedResults.push(mapEnrichmentDraftToCanonicalTags(buildDraft({
      careerStage: {
        value: stage,
        confidence: 0.8,
        evidenceIds: stage === 'unknown' ? [] : [`evidence_stage_${stage}`],
      },
    })));
  }

  for (const result of mappedResults) {
    assert.doesNotThrow(() => canonicalTagsSchema.parse(result));
  }
});

test('specific legacy labels map to the accepted canonical targets from the plan', () => {
  const cases: Array<{
    label: string;
    draft: Partial<CandidateEnrichmentDraft>;
    assertMapped: (canonicalTags: CanonicalTags) => void;
  }> = [
    {
      label: 'ai_research',
      draft: {
        primaryTrack: 'ai_research' as CandidateTrack,
        scoredTracks: [{
          track: 'ai_research',
          score: 0.9,
          evidenceIds: ['evidence_ai'],
        }],
      },
      assertMapped: (canonicalTags) => {
        assert.deepEqual(values(canonicalTags.industrySectors), ['artificial_intelligence_and_machine_learning']);
        assert.deepEqual(values(canonicalTags.relevantTags), ['artificial_intelligence_research']);
      },
    },
    {
      label: 'academic_research',
      draft: {
        primaryTrack: 'academic_research' as CandidateTrack,
        scoredTracks: [{
          track: 'academic_research',
          score: 0.9,
          evidenceIds: ['evidence_academic'],
        }],
      },
      assertMapped: (canonicalTags) => {
        assert.deepEqual(values(canonicalTags.industrySectors), ['research_and_academia']);
        assert.deepEqual(values(canonicalTags.relevantTags), ['academic_research']);
      },
    },
    {
      label: 'business_founder',
      draft: {
        primaryTrack: 'business_founder' as CandidateTrack,
        scoredTracks: [{
          track: 'business_founder',
          score: 0.9,
          evidenceIds: ['evidence_founder'],
        }],
      },
      assertMapped: (canonicalTags) => {
        assert.equal(canonicalTags.careerStage?.value, 'founder');
        assert.deepEqual(values(canonicalTags.roleFunctions), []);
        assert.deepEqual(values(canonicalTags.relevantTags), ['startup_founder']);
      },
    },
    {
      label: 'healthcare_ai',
      draft: {
        industryDomainInterests: [{
          domain: 'healthcare_ai' as CandidateIndustryDomain,
          confidence: 0.9,
          evidenceIds: ['evidence_healthcare'],
        }],
      },
      assertMapped: (canonicalTags) => {
        assert.deepEqual(values(canonicalTags.industrySectors), [
          'healthcare_and_life_sciences',
          'artificial_intelligence_and_machine_learning',
        ]);
        assert.deepEqual(values(canonicalTags.relevantTags), ['healthcare_artificial_intelligence']);
      },
    },
    {
      label: 'ai_infrastructure',
      draft: {
        industryDomainInterests: [{
          domain: 'ai_infrastructure' as CandidateIndustryDomain,
          confidence: 0.9,
          evidenceIds: ['evidence_infra'],
        }],
      },
      assertMapped: (canonicalTags) => {
        assert.deepEqual(values(canonicalTags.industrySectors), ['artificial_intelligence_and_machine_learning']);
        assert.deepEqual(values(canonicalTags.relevantTags), ['artificial_intelligence_infrastructure']);
      },
    },
    {
      label: 'open_source',
      draft: {
        industryDomainInterests: [{
          domain: 'open_source' as CandidateIndustryDomain,
          confidence: 0.9,
          evidenceIds: ['evidence_open_source'],
        }],
      },
      assertMapped: (canonicalTags) => {
        assert.deepEqual(canonicalTags.industrySectors, []);
        assert.deepEqual(values(canonicalTags.relevantTags), ['open_source']);
      },
    },
    {
      label: 'early_career',
      draft: {
        careerStage: {
          value: 'early_career' as CandidateCareerStage,
          confidence: 0.9,
          evidenceIds: ['evidence_stage'],
        },
      },
      assertMapped: (canonicalTags) => {
        assert.equal(canonicalTags.careerStage?.value, 'entry_level');
      },
    },
    {
      label: 'academic_researcher',
      draft: {
        careerStage: {
          value: 'academic_researcher' as CandidateCareerStage,
          confidence: 0.9,
          evidenceIds: ['evidence_academic_researcher'],
        },
      },
      assertMapped: (canonicalTags) => {
        assert.equal(canonicalTags.careerStage, null);
        assert.deepEqual(values(canonicalTags.relevantTags), ['academic_researcher']);
      },
    },
    {
      label: 'unknown_other',
      draft: {
        primaryTrack: 'unknown_other' as CandidateTrack,
        scoredTracks: [{
          track: 'unknown_other',
          score: 0.2,
          evidenceIds: [],
        }],
      },
      assertMapped: (canonicalTags) => {
        assert.deepEqual(canonicalTags.roleFunctions, []);
        assert.deepEqual(canonicalTags.industrySectors, []);
        assert.equal(canonicalTags.careerStage, null);
        assert.deepEqual(canonicalTags.relevantTags, []);
      },
    },
  ];

  for (const mappingCase of cases) {
    const canonicalTags = mapEnrichmentDraftToCanonicalTags(buildDraft(mappingCase.draft));
    assert.doesNotThrow(() => canonicalTagsSchema.parse(canonicalTags), mappingCase.label);
    mappingCase.assertMapped(canonicalTags);
  }
});
