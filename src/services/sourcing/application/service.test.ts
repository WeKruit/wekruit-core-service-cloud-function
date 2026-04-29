import assert from 'node:assert/strict';
import test from 'node:test';

import { SourcingService, type SourcingRepositoryPort } from './service';
import type {
  ApprovedEntity,
  DedupCandidate,
  EvidenceRecord,
  ReviewLabelRecord,
  SourceRecord,
} from '../domain/records';

function buildSourceRecord(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    id: 'src_github_person_alex',
    sourceRunId: 'phase3-run',
    sourceName: 'github',
    sourceDomain: 'developer',
    pipelineName: 'phase3-test',
    entityType: 'person',
    sourceNativeId: 'alex',
    sourceUrl: 'https://github.com/alex',
    displayName: 'Alex Rivera',
    institution: 'Example University',
    rawSummary: {
      github: 'https://github.com/alex',
      suggestedSignals: ['technical_project', 'open_source_contribution'],
    },
    display: {
      name: 'Alex Rivera',
    },
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
    sourceRunId: 'phase3-run',
    sourceRecordId: 'src_github_person_alex',
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

function buildCandidate(overrides: Partial<DedupCandidate> = {}): DedupCandidate {
  return {
    id: 'dedup_alex',
    entityType: 'person',
    status: 'pending_review',
    strength: 'strong',
    reasonCodes: ['github_exact'],
    sourceRecordIds: ['src_github_person_alex', 'src_devpost_person_alex'],
    evidenceIds: ['evidence_github_alex', 'evidence_devpost_alex'],
    valueHashes: ['github-hash'],
    displayName: 'Alex Rivera',
    createdFromSourceRunId: 'phase3-run',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

function buildApprovedEntity(overrides: Partial<ApprovedEntity> = {}): ApprovedEntity {
  return {
    id: 'cand_existing_alex',
    entityType: 'person',
    status: 'active',
    schemaVersion: 'global-candidate-v1',
    sourceRecordIds: ['src_github_person_alex'],
    evidenceIds: ['evidence_github_alex'],
    sourceNames: ['github'],
    sourceDomains: ['developer'],
    reviewLabelIds: ['review_existing'],
    identityEvidenceHashes: ['github-hash'],
    approvedByReviewLabelId: 'review_existing',
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
    createdAt: '2026-04-27T00:00:00.000Z',
    updatedAt: '2026-04-27T00:00:00.000Z',
    ...overrides,
  };
}

function buildReviewHarness(input: {
  candidate: DedupCandidate;
  sourceRecords: SourceRecord[];
  evidence: EvidenceRecord[];
  approvedEntities?: ApprovedEntity[];
}) {
  const createdReviewLabels: ReviewLabelRecord[] = [];
  const reviewedStatuses: DedupCandidate['status'][] = [];
  const approvedEntitiesById = new Map((input.approvedEntities ?? []).map((entity) => [entity.id, entity]));

  const repository = {
    listDedupCandidates: async () => [input.candidate],
    getSourceRecordsByIds: async (ids: string[]) =>
      input.sourceRecords.filter((record) => ids.includes(record.id)),
    listEvidenceBySourceRecordIds: async (ids: string[]) =>
      input.evidence.filter((entry) => ids.includes(entry.sourceRecordId)),
    createReviewLabel: async (label: ReviewLabelRecord) => {
      createdReviewLabels.push(label);
      return label;
    },
    markDedupCandidatesReviewed: async (
      candidates: DedupCandidate[],
      status: DedupCandidate['status'],
      now = new Date().toISOString(),
    ) => {
      reviewedStatuses.push(status);
      return candidates.map((candidate) => ({
        ...candidate,
        status,
        updatedAt: now,
      }));
    },
    upsertApprovedEntity: async (entity: ApprovedEntity) => {
      approvedEntitiesById.set(entity.id, entity);
      return entity;
    },
    findApprovedEntitiesBySourceRecordIds: async (sourceRecordIds: string[]) =>
      [...approvedEntitiesById.values()].filter((entity) =>
        entity.sourceRecordIds.some((sourceRecordId) => sourceRecordIds.includes(sourceRecordId)),
      ),
    findApprovedEntitiesByIdentityEvidenceHashes: async (identityEvidenceHashes: string[]) =>
      [...approvedEntitiesById.values()].filter((entity) =>
        entity.identityEvidenceHashes.some((identityEvidenceHash) =>
          identityEvidenceHashes.includes(identityEvidenceHash),
        ),
      ),
  } as Partial<SourcingRepositoryPort> as SourcingRepositoryPort;

  return {
    service: new SourcingService(repository),
    createdReviewLabels,
    reviewedStatuses,
    get approvedEntities() {
      return [...approvedEntitiesById.values()];
    },
  };
}

test('createReviewLabel materializes a singleton only when reviewer approves candidate relevance', async () => {
  const sourceRecord = buildSourceRecord();
  const evidence = buildEvidence();
  const candidate = buildCandidate({
    reasonCodes: ['singleton_review'],
    sourceRecordIds: [sourceRecord.id],
    evidenceIds: [evidence.id],
    valueHashes: ['singleton-hash'],
    strength: 'weak',
  });
  const harness = buildReviewHarness({
    candidate,
    sourceRecords: [sourceRecord],
    evidence: [evidence],
  });

  const result = await harness.service.createReviewLabel({
    dedupCandidateId: candidate.id,
    candidateDecision: 'approve_candidate',
    reviewerId: 'phase3-test',
    notes: 'Real developer with useful project signal.',
    confirmedSignals: ['technical_project'],
  });

  assert.equal(result.reviewLabel.identityLabel, null);
  assert.equal(result.reviewLabel.candidateDecision, 'approve_candidate');
  assert.deepEqual(result.reviewLabel.suggestedSignals, ['open_source_contribution', 'technical_project']);
  assert.deepEqual(result.reviewLabel.confirmedSignals, ['technical_project']);
  assert.deepEqual(harness.reviewedStatuses, ['approved_candidate']);
  assert.ok(result.approvedEntity);
  assert.equal(result.approvedEntity.status, 'active');
  assert.equal(result.approvedEntity.schemaVersion, 'global-candidate-v1');
  assert.deepEqual(result.approvedEntity.sourceNames, ['github']);
  assert.deepEqual(result.approvedEntity.sourceDomains, ['developer']);
  assert.deepEqual(result.approvedEntity.reviewLabelIds, [result.reviewLabel.id]);
  assert.deepEqual(result.approvedEntity.identityEvidenceHashes, ['github-hash']);
  assert.deepEqual(result.approvedEntity.confirmedSignals, ['technical_project']);
});

test('createReviewLabel stores same-person but not-relevant merge without materializing an entity', async () => {
  const githubRecord = buildSourceRecord();
  const devpostRecord = buildSourceRecord({
    id: 'src_devpost_person_alex',
    sourceName: 'devpost',
    sourceDomain: 'hackathon',
    sourceNativeId: 'https://devpost.com/alex',
    sourceUrl: 'https://devpost.com/alex',
    rawSummary: {
      github: 'https://github.com/alex',
      suggestedSignals: ['hackathon_participation'],
    },
  });
  const candidate = buildCandidate();
  const harness = buildReviewHarness({
    candidate,
    sourceRecords: [githubRecord, devpostRecord],
    evidence: [
      buildEvidence(),
      buildEvidence({
        id: 'evidence_devpost_alex',
        sourceRecordId: devpostRecord.id,
        sourceName: 'devpost',
      }),
    ],
  });

  const result = await harness.service.createReviewLabel({
    dedupCandidateId: candidate.id,
    identityLabel: 'same_person',
    candidateDecision: 'reject_not_relevant',
    reviewerId: 'phase3-test',
    notes: 'Same person, but not relevant for current sourcing needs.',
    confirmedSignals: [],
  });

  assert.equal(result.reviewLabel.identityLabel, 'same_person');
  assert.equal(result.reviewLabel.candidateDecision, 'reject_not_relevant');
  assert.deepEqual(result.reviewLabel.suggestedSignals, [
    'hackathon_participation',
    'open_source_contribution',
    'technical_project',
  ]);
  assert.deepEqual(result.reviewLabel.confirmedSignals, []);
  assert.deepEqual(harness.reviewedStatuses, ['rejected_not_relevant']);
  assert.equal(result.approvedEntity, null);
  assert.deepEqual(harness.approvedEntities, []);
});

test('createReviewLabel keeps legacy same_person label as approval alias', async () => {
  const githubRecord = buildSourceRecord();
  const devpostRecord = buildSourceRecord({
    id: 'src_devpost_person_alex',
    sourceName: 'devpost',
    sourceDomain: 'hackathon',
    sourceNativeId: 'https://devpost.com/alex',
    sourceUrl: 'https://devpost.com/alex',
    rawSummary: {
      suggestedSignals: ['hackathon_participation'],
    },
  });
  const candidate = buildCandidate();
  const harness = buildReviewHarness({
    candidate,
    sourceRecords: [githubRecord, devpostRecord],
    evidence: [
      buildEvidence(),
      buildEvidence({
        id: 'evidence_devpost_alex',
        sourceRecordId: devpostRecord.id,
        sourceName: 'devpost',
      }),
    ],
  });

  const result = await harness.service.createReviewLabel({
    dedupCandidateId: candidate.id,
    label: 'same_person',
    reviewerId: 'phase3-test',
    notes: 'Legacy approve merge action.',
  });

  assert.equal(result.reviewLabel.identityLabel, 'same_person');
  assert.equal(result.reviewLabel.candidateDecision, 'approve_candidate');
  assert.deepEqual(result.reviewLabel.confirmedSignals, result.reviewLabel.suggestedSignals);
  assert.deepEqual(harness.reviewedStatuses, ['approved_candidate']);
  assert.ok(result.approvedEntity);
});

test('createReviewLabel updates an existing global candidate when approved evidence overlaps', async () => {
  const githubRecord = buildSourceRecord();
  const devpostRecord = buildSourceRecord({
    id: 'src_devpost_person_alex',
    sourceName: 'devpost',
    sourceDomain: 'hackathon',
    sourceNativeId: 'https://devpost.com/alex',
    sourceUrl: 'https://devpost.com/alex',
    rawSummary: {
      github: 'https://github.com/alex',
      homepage: 'https://alex.example.com',
      suggestedSignals: ['hackathon_participation'],
    },
  });
  const candidate = buildCandidate();
  const existingEntity = buildApprovedEntity();
  const harness = buildReviewHarness({
    candidate,
    sourceRecords: [githubRecord, devpostRecord],
    evidence: [
      buildEvidence(),
      buildEvidence({
        id: 'evidence_devpost_alex',
        sourceRecordId: devpostRecord.id,
        sourceName: 'devpost',
        sourceDomain: 'hackathon',
      }),
    ],
    approvedEntities: [existingEntity],
  });

  const result = await harness.service.createReviewLabel({
    dedupCandidateId: candidate.id,
    identityLabel: 'same_person',
    candidateDecision: 'approve_candidate',
    reviewerId: 'phase4-test',
    notes: 'Attach Devpost evidence to the existing Alex candidate.',
    confirmedSignals: ['hackathon_participation'],
  });

  assert.ok(result.approvedEntity);
  assert.equal(result.approvedEntity.id, existingEntity.id);
  assert.equal(harness.approvedEntities.length, 1);
  assert.deepEqual(result.approvedEntity.sourceRecordIds, ['src_devpost_person_alex', 'src_github_person_alex']);
  assert.deepEqual(result.approvedEntity.sourceNames, ['devpost', 'github']);
  assert.deepEqual(result.approvedEntity.sourceDomains, ['developer', 'hackathon']);
  assert.deepEqual(result.approvedEntity.reviewLabelIds, [result.reviewLabel.id, 'review_existing']);
  assert.deepEqual(result.approvedEntity.confirmedSignals, ['hackathon_participation', 'open_source_contribution']);
  assert.equal(result.approvedEntity.createdAt, existingEntity.createdAt);
  assert.equal(result.approvedEntity.needsEnrichment, true);
});
