import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEnrichmentEvidencePack,
  deriveDraftFieldEvidence,
  validateCandidateEnrichmentDraft,
  vendorProfileMatchEvidenceId,
} from './enrichment';
import type {
  ApprovedEntity,
  CandidateEnrichmentDraft,
  EvidenceRecord,
  ReviewLabelRecord,
  SourceRecord,
  VendorProfileMatch,
} from '../domain/records';

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

function buildApprovedEntity(overrides: Partial<ApprovedEntity> = {}): ApprovedEntity {
  return {
    id: 'cand_alex',
    entityType: 'person',
    status: 'active',
    schemaVersion: 'global-candidate-v1',
    sourceRecordIds: ['src_alex'],
    evidenceIds: ['evidence_github_alex'],
    sourceNames: ['github'],
    sourceDomains: ['developer'],
    reviewLabelIds: ['review_alex'],
    identityEvidenceHashes: ['github-hash'],
    approvedByReviewLabelId: 'review_alex',
    displayName: 'Alex Rivera',
    emails: [],
    homepages: [],
    githubUrls: ['https://github.com/alex'],
    orcids: [],
    institutions: ['example university'],
    suggestedSignals: ['open_source_contribution'],
    confirmedSignals: ['open_source_contribution'],
    needsEnrichment: true,
    enrichmentStatus: 'not_started',
    mergedIntoCandidateId: null,
    mergedByReviewId: null,
    mergedAt: null,
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

function buildSourceRecord(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: 'src_alex',
    sourceRunId: 'run_alex',
    sourceName: 'github',
    sourceDomain: 'developer',
    pipelineName: 'test',
    entityType: 'person',
    sourceNativeId: 'alex',
    sourceUrl: 'https://github.com/alex',
    displayName: 'Alex Rivera',
    institution: 'Example University',
    rawSummary: { github: 'https://github.com/alex' },
    display: { name: 'Alex Rivera' },
    raw: {},
    nameInstitutionKey: 'alex rivera::example university',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

function buildEvidence(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 'evidence_github_alex',
    sourceRunId: 'run_alex',
    sourceRecordId: 'src_alex',
    sourceName: 'github',
    sourceDomain: 'developer',
    entityType: 'person',
    evidenceType: 'github',
    rawValue: 'https://github.com/alex',
    normalizedValue: 'https://github.com/alex',
    valueHash: 'github-hash',
    quality: 'high',
    extractedFrom: {
      sourcePath: 'rawSummary.github',
      sourceUrl: 'https://github.com/alex',
    },
    observedAt: '2026-04-28T00:00:00.000Z',
    extractorVersion: 'sourcing-evidence-v1',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

function buildReviewLabel(overrides: Partial<ReviewLabelRecord> = {}): ReviewLabelRecord {
  return {
    id: 'review_alex',
    dedupCandidateId: 'dedup_alex',
    identityLabel: null,
    candidateDecision: 'approve_candidate',
    reviewerId: 'phase65e-test',
    notes: 'Approved candidate.',
    suggestedSignals: ['open_source_contribution'],
    confirmedSignals: ['open_source_contribution'],
    sourceRecordIds: ['src_alex'],
    evidenceIds: ['evidence_github_alex'],
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

function buildVendorMatch(overrides: Partial<VendorProfileMatch> = {}): VendorProfileMatch {
  return {
    id: 'vendor_match_alex',
    approvedEntityId: 'cand_alex',
    vendorRunId: 'vendor_run_alex',
    provider: 'fake',
    lookupType: 'linkedin_profile_by_url',
    inputUrlHash: 'vendor-input-hash',
    selectedLinkedInUrl: 'https://www.linkedin.com/in/alexrivera',
    selectedLinkedInUrlLineage: {
      url: 'https://www.linkedin.com/in/alexrivera',
      sourceRecordIds: ['src_alex'],
      evidenceIds: ['evidence_linkedin_alex'],
      sourcePaths: ['rawSummary.linkedin'],
    },
    providerRecordId: 'fake:alexrivera',
    providerProfileUrl: 'https://www.linkedin.com/in/alexrivera',
    normalizedProfile: {
      profileUrl: 'https://www.linkedin.com/in/alexrivera',
      name: 'Alex Rivera',
      headline: 'Software engineer',
      currentCompany: 'Example Labs',
      location: 'San Francisco Bay Area',
      educationSummary: ['Example University, Computer Science'],
      experienceSummary: ['Software engineer at Example Labs'],
      skills: ['typescript', 'developer tools'],
      aboutSummary: 'Builds developer tooling.',
      projectsPublications: ['Open-source CLI'],
    },
    reviewStatus: 'approved',
    reviewerId: 'phase65e-test',
    reviewNote: 'Correct profile.',
    reviewedAt: '2026-04-28T00:00:00.000Z',
    approvedEvidenceId: 'vendor_profile_match:vendor_match_alex',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
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

test('buildEnrichmentEvidencePack includes only approved vendor profile evidence', () => {
  const approvedVendorMatch = buildVendorMatch();
  const rejectedVendorMatch = buildVendorMatch({
    id: 'vendor_match_rejected',
    approvedEvidenceId: null,
    reviewStatus: 'rejected',
  });
  const pendingVendorMatch = buildVendorMatch({
    id: 'vendor_match_pending',
    approvedEvidenceId: null,
    reviewStatus: 'pending_review',
  });

  const pack = buildEnrichmentEvidencePack({
    approvedEntity: buildApprovedEntity(),
    sourceRecords: [buildSourceRecord()],
    evidence: [buildEvidence()],
    reviewLabels: [buildReviewLabel()],
    vendorProfileMatches: [rejectedVendorMatch, approvedVendorMatch, pendingVendorMatch],
  });

  assert.deepEqual(
    pack.evidence.map((entry) => entry.id),
    ['evidence_github_alex', 'vendor_profile_match:vendor_match_alex'],
  );
  assert.equal(pack.professionalProfileFacts.length, 1);
  assert.equal(pack.professionalProfileFacts[0]?.matchId, approvedVendorMatch.id);
  assert.equal(pack.professionalProfileFacts[0]?.currentCompany, 'Example Labs');
});

test('validateCandidateEnrichmentDraft accepts approved vendor profile evidence IDs', () => {
  const vendorEvidenceId = vendorProfileMatchEvidenceId('vendor_match_alex');
  const { draft } = validateCandidateEnrichmentDraft(
    deriveDraftFieldEvidence(
      buildDraft({
        scoredTracks: [
          {
            track: 'software_engineering',
            score: 0.88,
            evidenceIds: [vendorEvidenceId],
          },
        ],
        primaryTrack: 'software_engineering',
        specializations: [
          {
            specialization: 'developer_experience',
            confidence: 0.8,
            evidenceIds: [vendorEvidenceId],
          },
        ],
        skills: [
          {
            skill: 'typescript',
            confidence: 0.75,
            evidenceIds: [vendorEvidenceId],
          },
        ],
        industryDomainInterests: [
          {
            domain: 'developer_tools',
            confidence: 0.7,
            evidenceIds: [vendorEvidenceId],
          },
        ],
        careerStage: {
          value: 'early_career',
          confidence: 0.65,
          evidenceIds: [vendorEvidenceId],
        },
        contactability: {
          value: 'medium',
          confidence: 0.65,
          evidenceIds: [vendorEvidenceId],
        },
        fieldEvidence: {
          primaryTrack: [vendorEvidenceId],
          skills: [vendorEvidenceId],
          matchingSummary: [vendorEvidenceId],
        },
      }),
    ),
    [vendorEvidenceId],
  );

  assert.deepEqual(draft.scoredTracks[0]?.evidenceIds, [vendorEvidenceId]);
  assert.deepEqual(draft.fieldEvidence.skills, [vendorEvidenceId]);
});
