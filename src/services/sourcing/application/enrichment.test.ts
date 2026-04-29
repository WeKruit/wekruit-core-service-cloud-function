import assert from 'node:assert/strict';
import test from 'node:test';

import {
  deriveDraftFieldEvidence,
  validateCandidateEnrichmentDraft,
} from './enrichment';
import type { CandidateEnrichmentDraft } from '../domain/records';

function buildDraft(overrides: Partial<CandidateEnrichmentDraft> = {}): CandidateEnrichmentDraft {
  return {
    schemaVersion: 'candidate-enrichment-draft-v1',
    primaryTrack: 'academic_research',
    scoredTracks: [
      {
        track: 'academic_research',
        score: 0.9,
        evidenceIds: ['evidence_orcid'],
      },
    ],
    specializations: [
      {
        specialization: 'academic_publishing',
        confidence: 0.8,
        evidenceIds: ['evidence_orcid'],
      },
    ],
    skills: [
      {
        skill: 'paper writing',
        confidence: 0.75,
        evidenceIds: ['evidence_orcid'],
      },
    ],
    industryDomainInterests: [
      {
        domain: 'research_tools',
        confidence: 0.7,
        evidenceIds: ['evidence_orcid'],
      },
    ],
    careerStage: {
      value: 'academic_researcher',
      confidence: 0.7,
      evidenceIds: ['evidence_orcid'],
    },
    contactability: {
      value: 'medium',
      confidence: 0.65,
      evidenceIds: ['evidence_orcid'],
    },
    matchingSummary: 'Academic researcher with approved ORCID evidence.',
    fieldEvidence: {},
    proposedTags: [],
    warnings: [],
    ...overrides,
  };
}

test('validateCandidateEnrichmentDraft drops optional no-evidence skills and tags with warnings', () => {
  const { draft, warnings } = validateCandidateEnrichmentDraft(
    deriveDraftFieldEvidence(
      buildDraft({
        skills: [
          {
            skill: 'paper writing',
            confidence: 0.75,
            evidenceIds: ['evidence_orcid'],
          },
          {
            skill: 'unknown_other',
            confidence: 0.2,
            evidenceIds: [],
          },
        ],
        proposedTags: [
          {
            tag: 'research_builder',
            reason: 'Supported by approved ORCID evidence.',
            evidenceIds: ['evidence_orcid'],
          },
          {
            tag: 'unsupported_guess',
            reason: 'No evidence was attached.',
            evidenceIds: [],
          },
        ],
      }),
    ),
    ['evidence_orcid'],
  );

  assert.deepEqual(draft.skills.map((skill) => skill.skill), ['paper writing']);
  assert.deepEqual(draft.proposedTags.map((tag) => tag.tag), ['research_builder']);
  assert.ok(warnings.some((warning) => warning.includes('Dropped skill "unknownother"')));
  assert.ok(warnings.some((warning) => warning.includes('Dropped proposed tag "unsupported_guess"')));
});

test('validateCandidateEnrichmentDraft repairs a missing primary track scored entry', () => {
  const { draft, warnings } = validateCandidateEnrichmentDraft(
    deriveDraftFieldEvidence(
      buildDraft({
        primaryTrack: 'academic_research',
        scoredTracks: [
          {
            track: 'ai_research',
            score: 0.7,
            evidenceIds: ['evidence_orcid'],
          },
        ],
        fieldEvidence: {
          primaryTrack: ['evidence_orcid'],
        },
      }),
    ),
    ['evidence_orcid'],
  );

  const academicResearch = draft.scoredTracks.find((track) => track.track === 'academic_research');
  assert.ok(academicResearch);
  assert.deepEqual(academicResearch.evidenceIds, ['evidence_orcid']);
  assert.ok(warnings.some((warning) => warning.includes('Added primary track "academic_research"')));
});
