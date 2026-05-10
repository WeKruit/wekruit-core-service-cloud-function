import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PendingMergeReviewBlockError,
  SourcingService,
  VendorProfileLookupProviderError,
  VendorProfileLookupValidationError,
  type SourcingRepositoryPort,
} from './service';
import type {
  ProfessionalProfileLookupPort,
  ProfessionalProfileLookupResult,
} from '../integrations/brightdata';
import type {
  ApprovedEntity,
  CandidateEnrichmentDraft,
  CandidateEnrichmentReviewItem,
  CandidateEnrichmentRun,
  CandidateProfile,
  DedupCandidate,
  EvidenceRecord,
  ReviewLabelRecord,
  SourceRecord,
  VendorEnrichmentRun,
  VendorProfileMatch,
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

function buildReviewLabel(overrides: Partial<ReviewLabelRecord> = {}): ReviewLabelRecord {
  return {
    id: 'review_existing',
    dedupCandidateId: 'dedup_alex',
    identityLabel: null,
    candidateDecision: 'approve_candidate',
    reviewerId: 'phase5-test',
    notes: 'Approved as a real technical candidate.',
    suggestedSignals: ['open_source_contribution'],
    confirmedSignals: ['open_source_contribution'],
    sourceRecordIds: ['src_github_person_alex'],
    evidenceIds: ['evidence_github_alex'],
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

function buildEnrichmentDraft(overrides: Partial<CandidateEnrichmentDraft> = {}): CandidateEnrichmentDraft {
  return {
    schemaVersion: 'candidate-enrichment-draft-v1',
    primaryTrack: 'software_engineering',
    scoredTracks: [
      {
        track: 'software_engineering',
        score: 0.88,
        evidenceIds: ['evidence_github_alex'],
      },
    ],
    specializations: [
      {
        specialization: 'developer_experience',
        confidence: 0.72,
        evidenceIds: ['evidence_github_alex'],
      },
    ],
    skills: [
      {
        skill: 'typescript',
        confidence: 0.68,
        evidenceIds: ['evidence_github_alex'],
      },
    ],
    industryDomainInterests: [
      {
        domain: 'developer_tools',
        confidence: 0.66,
        evidenceIds: ['evidence_github_alex'],
      },
    ],
    careerStage: {
      value: 'unknown',
      confidence: 0.2,
      evidenceIds: [],
    },
    contactability: {
      value: 'medium',
      confidence: 0.74,
      evidenceIds: ['evidence_github_alex'],
    },
    matchingSummary: 'Open-source software engineering candidate with developer tooling evidence.',
    fieldEvidence: {
      primaryTrack: ['evidence_github_alex'],
      scoredTracks: ['evidence_github_alex'],
      specializations: ['evidence_github_alex'],
      skills: ['evidence_github_alex'],
      industryDomainInterests: ['evidence_github_alex'],
      careerStage: [],
      contactability: ['evidence_github_alex'],
      matchingSummary: ['evidence_github_alex'],
    },
    proposedTags: [],
    warnings: [],
    ...overrides,
  };
}

function buildCandidateProfile(overrides: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    id: 'profile_cand_existing_alex',
    approvedEntityId: 'cand_existing_alex',
    enrichmentRunId: 'enrich_run_alex',
    enrichmentReviewItemId: 'enrich_review_alex',
    schemaVersion: 'candidate-profile-v1',
    profileVersion: 1,
    status: 'active',
    displayName: 'Alex Rivera',
    sourceNames: ['github', 'devpost'],
    sourceDomains: ['developer', 'hackathon'],
    sourceRecordIds: ['src_github_person_alex'],
    evidenceIds: ['evidence_github_alex'],
    reviewLabelIds: ['review_existing'],
    primaryTrack: 'software_engineering',
    scoredTracks: [
      {
        track: 'software_engineering',
        score: 0.88,
        evidenceIds: ['evidence_github_alex'],
      },
    ],
    specializations: [
      {
        specialization: 'developer_experience',
        confidence: 0.72,
        evidenceIds: ['evidence_github_alex'],
      },
    ],
    skills: [
      {
        skill: 'typescript',
        confidence: 0.68,
        evidenceIds: ['evidence_github_alex'],
      },
    ],
    industryDomainInterests: [
      {
        domain: 'developer_tools',
        confidence: 0.66,
        evidenceIds: ['evidence_github_alex'],
      },
    ],
    careerStage: {
      value: 'unknown',
      confidence: 0.2,
      evidenceIds: [],
    },
    contactability: {
      value: 'medium',
      confidence: 0.74,
      evidenceIds: ['evidence_github_alex'],
    },
    matchingSummary: 'Open-source software engineering candidate with developer tooling evidence.',
    fieldEvidence: {
      primaryTrack: ['evidence_github_alex'],
      skills: ['evidence_github_alex'],
    },
    proposedTags: [],
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
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

function buildVendorMatch(overrides: Partial<VendorProfileMatch> = {}): VendorProfileMatch {
  return {
    id: 'vendor_match_existing',
    approvedEntityId: 'cand_existing_alex',
    vendorRunId: 'vendor_run_existing',
    provider: 'fake',
    lookupType: 'linkedin_profile_by_url',
    inputUrlHash: 'lookup-hash',
    selectedLinkedInUrl: 'https://www.linkedin.com/in/spencerwang1',
    selectedLinkedInUrlLineage: {
      url: 'https://www.linkedin.com/in/spencerwang1',
      sourceRecordIds: ['src_github_person_alex'],
      evidenceIds: ['evidence_linkedin_alex'],
      sourcePaths: ['rawSummary.linkedin'],
    },
    providerRecordId: 'fake:spencerwang1',
    providerProfileUrl: 'https://www.linkedin.com/in/spencerwang1',
    normalizedProfile: {
      profileUrl: 'https://www.linkedin.com/in/spencerwang1',
      name: 'Spencer Wang',
      headline: 'Synthetic provider response',
      currentCompany: 'WeKruit Test Fixture',
      location: 'San Francisco Bay Area, US',
      educationSummary: ['Synthetic University | Computer Science'],
      experienceSummary: ['Builder at Synthetic Labs'],
      skills: ['software engineering', 'candidate sourcing'],
      aboutSummary: 'Synthetic local fixture for validating professional profile lookup.',
      projectsPublications: ['Synthetic sourcing pipeline validation'],
    },
    reviewStatus: 'pending_review',
    reviewerId: null,
    reviewNote: '',
    reviewedAt: null,
    approvedEvidenceId: null,
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
    ...overrides,
  };
}

function successfulLookupResult(url = 'https://www.linkedin.com/in/spencerwang1'): ProfessionalProfileLookupResult {
  return {
    provider: 'fake',
    lookupType: 'linkedin_profile_by_url',
    datasetId: 'fake-linkedin-profiles',
    inputUrl: url,
    status: 'completed',
    snapshotId: null,
    matches: [
      {
        provider: 'fake',
        providerRecordId: 'fake:spencerwang1',
        providerProfileUrl: url,
        normalizedProfile: {
          profileUrl: url,
          name: 'Spencer Wang',
          headline: 'Synthetic provider response',
          currentCompany: 'WeKruit Test Fixture',
          location: 'San Francisco Bay Area, US',
          educationSummary: ['Synthetic University | Computer Science'],
          experienceSummary: ['Builder at Synthetic Labs'],
          skills: ['software engineering', 'candidate sourcing'],
          aboutSummary: 'Synthetic local fixture for validating professional profile lookup.',
          projectsPublications: ['Synthetic sourcing pipeline validation'],
        },
      },
    ],
  };
}

function noMatchLookupResult(url = 'https://www.linkedin.com/in/spencerwang1'): ProfessionalProfileLookupResult {
  return {
    provider: 'fake',
    lookupType: 'linkedin_profile_by_url',
    datasetId: 'fake-linkedin-profiles',
    inputUrl: url,
    status: 'no_match',
    snapshotId: null,
    matches: [],
  };
}

function buildVendorLookupHarness(input: {
  approvedEntity?: ApprovedEntity | null;
  sourceRecords?: SourceRecord[];
  evidence?: EvidenceRecord[];
  pendingCandidates?: DedupCandidate[];
  providerResults?: ProfessionalProfileLookupResult[];
  providerErrors?: Error[];
  vendorRuns?: VendorEnrichmentRun[];
  vendorMatches?: VendorProfileMatch[];
}) {
  let providerCalls = 0;
  const approvedEntitiesById = new Map(
    input.approvedEntity ? [[input.approvedEntity.id, input.approvedEntity]] : [],
  );
  const vendorRunsById = new Map((input.vendorRuns ?? []).map((run) => [run.id, run]));
  const vendorMatchesById = new Map((input.vendorMatches ?? []).map((match) => [match.id, match]));
  const providerResults = [...(input.providerResults ?? [successfulLookupResult()])];
  const providerErrors = [...(input.providerErrors ?? [])];
  const provider: ProfessionalProfileLookupPort = {
    lookupLinkedInProfile: async () => {
      providerCalls += 1;
      const error = providerErrors.shift();
      if (error) {
        throw error;
      }
      return providerResults.shift() ?? successfulLookupResult();
    },
  };
  const repository = {
    getApprovedEntity: async (id: string) => approvedEntitiesById.get(id) ?? null,
    listDedupCandidates: async () => input.pendingCandidates ?? [],
    getSourceRecordsByIds: async (ids: string[]) =>
      (input.sourceRecords ?? []).filter((record) => ids.includes(record.id)),
    getEvidenceByIds: async (ids: string[]) =>
      (input.evidence ?? []).filter((entry) => ids.includes(entry.id)),
    listVendorEnrichmentRunsForApprovedEntity: async (approvedEntityId: string) =>
      [...vendorRunsById.values()]
        .filter((run) => run.approvedEntityId === approvedEntityId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    listVendorEnrichmentRunsByInputHash: async (approvedEntityId: string, inputUrlHash: string) =>
      [...vendorRunsById.values()]
        .filter((run) => run.approvedEntityId === approvedEntityId && run.inputUrlHash === inputUrlHash),
    startVendorEnrichmentRun: async (run: VendorEnrichmentRun) => {
      const existing = vendorRunsById.get(run.id);
      if (existing && existing.status !== 'failed') {
        return {
          run: existing,
          shouldCallProvider: false,
        };
      }
      const next = existing?.status === 'failed'
        ? {
          ...existing,
          status: 'running' as const,
          snapshotId: null,
          matchIds: [],
          error: null,
          updatedAt: run.updatedAt,
        }
        : run;
      vendorRunsById.set(next.id, next);
      return {
        run: next,
        shouldCallProvider: true,
      };
    },
    getVendorEnrichmentRun: async (id: string) => vendorRunsById.get(id) ?? null,
    updateVendorEnrichmentRun: async (run: VendorEnrichmentRun) => {
      vendorRunsById.set(run.id, run);
      return run;
    },
    upsertVendorProfileMatches: async (matches: VendorProfileMatch[]) => {
      for (const match of matches) {
        vendorMatchesById.set(match.id, match);
      }
      return matches;
    },
    getVendorProfileMatch: async (id: string) => vendorMatchesById.get(id) ?? null,
    listVendorProfileMatchesForApprovedEntity: async (approvedEntityId: string) =>
      [...vendorMatchesById.values()]
        .filter((match) => match.approvedEntityId === approvedEntityId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    listVendorProfileMatchesByInputHash: async (approvedEntityId: string, inputUrlHash: string) =>
      [...vendorMatchesById.values()]
        .filter((match) => match.approvedEntityId === approvedEntityId && match.inputUrlHash === inputUrlHash),
    updateVendorProfileMatch: async (match: VendorProfileMatch) => {
      vendorMatchesById.set(match.id, match);
      return match;
    },
    upsertApprovedEntity: async (entity: ApprovedEntity) => {
      approvedEntitiesById.set(entity.id, entity);
      return entity;
    },
  } as Partial<SourcingRepositoryPort> as SourcingRepositoryPort;

  return {
    service: new SourcingService(repository, undefined, provider),
    get providerCalls() {
      return providerCalls;
    },
    get vendorRuns() {
      return [...vendorRunsById.values()];
    },
    get vendorMatches() {
      return [...vendorMatchesById.values()];
    },
    get approvedEntity() {
      const id = input.approvedEntity?.id;
      return id ? approvedEntitiesById.get(id) ?? null : null;
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

test('createReviewLabel excludes LinkedIn-shaped evidence from approved identity hashes', async () => {
  const sourceRecord = buildSourceRecord({
    id: 'src_synthetic_person_spencer',
    sourceName: 'synthetic_test',
    sourceDomain: 'manual_test',
    sourceNativeId: 'synthetic-spencer',
    sourceUrl: 'https://www.linkedin.com/in/spencerwang1',
    displayName: 'Spencer Wang',
    institution: undefined,
    rawSummary: {},
    display: {},
    nameInstitutionKey: null,
  });
  const evidence = [
    buildEvidence({
      id: 'evidence_spencer_source_url',
      sourceRecordId: sourceRecord.id,
      sourceName: sourceRecord.sourceName,
      sourceDomain: sourceRecord.sourceDomain,
      evidenceType: 'source_url',
      rawValue: 'https://www.linkedin.com/in/spencerwang1',
      normalizedValue: 'https://www.linkedin.com/in/spencerwang1',
      valueHash: 'linkedin-source-url-hash',
      quality: 'medium',
    }),
    buildEvidence({
      id: 'evidence_spencer_homepage',
      sourceRecordId: sourceRecord.id,
      sourceName: sourceRecord.sourceName,
      sourceDomain: sourceRecord.sourceDomain,
      evidenceType: 'homepage',
      rawValue: 'https://www.linkedin.com/in/spencerwang1',
      normalizedValue: 'https://www.linkedin.com/in/spencerwang1',
      valueHash: 'linkedin-homepage-hash',
      quality: 'medium',
    }),
    buildEvidence({
      id: 'evidence_spencer_linkedin',
      sourceRecordId: sourceRecord.id,
      sourceName: sourceRecord.sourceName,
      sourceDomain: sourceRecord.sourceDomain,
      evidenceType: 'linkedin',
      rawValue: 'https://www.linkedin.com/in/spencerwang1',
      normalizedValue: 'https://www.linkedin.com/in/spencerwang1',
      valueHash: 'linkedin-evidence-hash',
      quality: 'medium',
    }),
  ];
  const candidate = buildCandidate({
    id: 'dedup_synthetic_spencer',
    reasonCodes: ['singleton_review'],
    sourceRecordIds: [sourceRecord.id],
    evidenceIds: evidence.map((entry) => entry.id),
    valueHashes: ['singleton-spencer-hash'],
    strength: 'weak',
    displayName: 'Spencer Wang',
  });
  const harness = buildReviewHarness({
    candidate,
    sourceRecords: [sourceRecord],
    evidence,
  });

  const result = await harness.service.createReviewLabel({
    dedupCandidateId: candidate.id,
    candidateDecision: 'approve_candidate',
    reviewerId: 'phase6-5b-test',
    notes: 'Synthetic candidate with LinkedIn-only evidence.',
    confirmedSignals: [],
  });

  assert.ok(result.approvedEntity);
  assert.equal(result.approvedEntity.id.startsWith('cand_'), true);
  assert.deepEqual(result.approvedEntity.identityEvidenceHashes, []);
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

test('listApprovedEntities surfaces pending merge blockers for approved candidates', async () => {
  const approvedEntity = buildApprovedEntity();
  const sourceRecord = buildSourceRecord();
  const blocker = buildCandidate({
    id: 'dedup_pending_devpost_merge',
    sourceRecordIds: ['src_github_person_alex', 'src_devpost_person_alex'],
    valueHashes: ['github-hash'],
    displayName: 'Alex Rivera',
  });
  const unrelated = buildCandidate({
    id: 'dedup_pending_unrelated',
    sourceRecordIds: ['src_other_person_a', 'src_other_person_b'],
    valueHashes: ['other-hash'],
    displayName: 'Other Person',
  });

  const repository = {
    listApprovedEntities: async () => [approvedEntity],
    listDedupCandidates: async () => [blocker, unrelated],
    getSourceRecordsByIds: async (ids: string[]) => [sourceRecord].filter((record) => ids.includes(record.id)),
  } as Partial<SourcingRepositoryPort> as SourcingRepositoryPort;

  const service = new SourcingService(repository);
  const [result] = await service.listApprovedEntities();

  assert.equal(result.pendingMergeReviewCount, 1);
  assert.deepEqual(result.pendingMergeReviewIds, ['dedup_pending_devpost_merge']);
  assert.equal(result.pendingMergeReviewBlockers[0]?.displayName, 'Alex Rivera');
  assert.equal(result.sourceRecordSummaries[0]?.id, 'src_github_person_alex');
  assert.deepEqual(result.sourceRecordSummaries[0]?.linkGroups[0], {
    label: 'Source',
    urls: ['https://github.com/alex'],
  });
});

test('runProfessionalProfileLookupForApprovedEntity validates approved entity and LinkedIn lineage gates', async () => {
  const approvedEntity = buildApprovedEntity({
    id: 'cand_spencer',
    sourceRecordIds: ['src_spencer'],
    evidenceIds: [],
    status: 'active',
  });
  const sourceRecord = buildSourceRecord({
    id: 'src_spencer',
    sourceUrl: 'https://devpost.com/spencer',
    rawSummary: {},
    display: {},
  });
  let harness = buildVendorLookupHarness({ approvedEntity: null });

  await assert.rejects(
    harness.service.runProfessionalProfileLookupForApprovedEntity(
      'missing-candidate',
      'https://www.linkedin.com/in/spencerwang1',
    ),
    (error: unknown) => error instanceof VendorProfileLookupValidationError,
  );

  harness = buildVendorLookupHarness({
    approvedEntity: {
      ...approvedEntity,
      status: 'merged',
    },
    sourceRecords: [sourceRecord],
  });
  await assert.rejects(
    harness.service.runProfessionalProfileLookupForApprovedEntity(
      approvedEntity.id,
      'https://www.linkedin.com/in/spencerwang1',
    ),
    /not active/,
  );

  harness = buildVendorLookupHarness({
    approvedEntity,
    sourceRecords: [sourceRecord],
    evidence: [],
  });
  await assert.rejects(
    harness.service.runProfessionalProfileLookupForApprovedEntity(
      approvedEntity.id,
      'https://www.linkedin.com/in/spencerwang1',
    ),
    /no eligible LinkedIn profile URL/,
  );

  const linkedInEvidence = buildEvidence({
    id: 'evidence_spencer_linkedin',
    sourceRecordId: sourceRecord.id,
    evidenceType: 'linkedin',
    rawValue: 'https://www.linkedin.com/in/spencerwang1',
    normalizedValue: 'https://www.linkedin.com/in/spencerwang1',
    valueHash: 'linkedin-spencer-hash',
    quality: 'medium',
  });
  harness = buildVendorLookupHarness({
    approvedEntity: {
      ...approvedEntity,
      evidenceIds: [linkedInEvidence.id],
    },
    sourceRecords: [sourceRecord],
    evidence: [linkedInEvidence],
  });
  await assert.rejects(
    harness.service.runProfessionalProfileLookupForApprovedEntity(
      approvedEntity.id,
      'https://www.linkedin.com/in/someone-else',
    ),
    /not present/,
  );
});

test('runProfessionalProfileLookupForApprovedEntity blocks pending merge review before provider call', async () => {
  const approvedEntity = buildApprovedEntity({
    id: 'cand_spencer',
    sourceRecordIds: ['src_spencer'],
    evidenceIds: ['evidence_spencer_linkedin'],
  });
  const sourceRecord = buildSourceRecord({
    id: 'src_spencer',
    rawSummary: {
      linkedin: 'https://www.linkedin.com/in/spencerwang1',
    },
  });
  const linkedInEvidence = buildEvidence({
    id: 'evidence_spencer_linkedin',
    sourceRecordId: sourceRecord.id,
    evidenceType: 'linkedin',
    rawValue: 'https://www.linkedin.com/in/spencerwang1',
    normalizedValue: 'https://www.linkedin.com/in/spencerwang1',
    valueHash: 'linkedin-spencer-hash',
    quality: 'medium',
  });
  const blocker = buildCandidate({
    id: 'dedup_pending_spencer_merge',
    sourceRecordIds: ['src_spencer', 'src_other_spencer'],
    valueHashes: ['github-hash'],
  });
  const harness = buildVendorLookupHarness({
    approvedEntity,
    sourceRecords: [sourceRecord],
    evidence: [linkedInEvidence],
    pendingCandidates: [blocker],
  });

  await assert.rejects(
    harness.service.runProfessionalProfileLookupForApprovedEntity(
      approvedEntity.id,
      'https://www.linkedin.com/in/spencerwang1',
    ),
    (error: unknown) => error instanceof PendingMergeReviewBlockError,
  );
  assert.equal(harness.providerCalls, 0);
});

test('runProfessionalProfileLookupForApprovedEntity creates fake run and prevents duplicate spend', async () => {
  const approvedEntity = buildApprovedEntity({
    id: 'cand_spencer',
    sourceRecordIds: ['src_spencer'],
    evidenceIds: ['evidence_spencer_linkedin'],
  });
  const sourceRecord = buildSourceRecord({
    id: 'src_spencer',
    rawSummary: {
      linkedin: 'https://www.linkedin.com/in/spencerwang1',
    },
  });
  const linkedInEvidence = buildEvidence({
    id: 'evidence_spencer_linkedin',
    sourceRecordId: sourceRecord.id,
    evidenceType: 'linkedin',
    rawValue: 'https://www.linkedin.com/in/spencerwang1',
    normalizedValue: 'https://www.linkedin.com/in/spencerwang1',
    valueHash: 'linkedin-spencer-hash',
    quality: 'medium',
  });
  const harness = buildVendorLookupHarness({
    approvedEntity,
    sourceRecords: [sourceRecord],
    evidence: [linkedInEvidence],
  });

  const first = await harness.service.runProfessionalProfileLookupForApprovedEntity(
    approvedEntity.id,
    'https://www.linkedin.com/in/spencerwang1/',
  );
  const second = await harness.service.runProfessionalProfileLookupForApprovedEntity(
    approvedEntity.id,
    'https://www.linkedin.com/in/spencerwang1',
  );

  assert.equal(first.reusedExisting, false);
  assert.equal(second.reusedExisting, true);
  assert.equal(harness.providerCalls, 1);
  assert.equal(first.run.status, 'completed');
  assert.equal(first.matchesForRun.length, 1);
  assert.equal(second.run.id, first.run.id);
  assert.equal(second.matchesForRun[0]?.id, first.matchesForRun[0]?.id);
  assert.deepEqual(first.eligibleLinkedInUrls[0]?.evidenceIds, ['evidence_spencer_linkedin']);
});

test('runProfessionalProfileLookupForApprovedEntity remembers rejected or ignored matches by query hash', async () => {
  const approvedEntity = buildApprovedEntity({
    id: 'cand_spencer',
    sourceRecordIds: ['src_spencer'],
    evidenceIds: ['evidence_spencer_linkedin'],
  });
  const sourceRecord = buildSourceRecord({
    id: 'src_spencer',
    rawSummary: {
      linkedin: 'https://www.linkedin.com/in/spencerwang1',
    },
  });
  const linkedInEvidence = buildEvidence({
    id: 'evidence_spencer_linkedin',
    sourceRecordId: sourceRecord.id,
    evidenceType: 'linkedin',
    rawValue: 'https://www.linkedin.com/in/spencerwang1',
    normalizedValue: 'https://www.linkedin.com/in/spencerwang1',
    valueHash: 'linkedin-spencer-hash',
    quality: 'medium',
  });
  const harness = buildVendorLookupHarness({
    approvedEntity,
    sourceRecords: [sourceRecord],
    evidence: [linkedInEvidence],
  });
  const first = await harness.service.runProfessionalProfileLookupForApprovedEntity(
    approvedEntity.id,
    'https://www.linkedin.com/in/spencerwang1',
  );
  const ignored = await harness.service.decideVendorProfileMatch(first.matchesForRun[0]?.id ?? '', {
    action: 'ignore',
    reviewerId: 'phase65c-test',
    notes: 'Not enough evidence.',
  });
  const second = await harness.service.runProfessionalProfileLookupForApprovedEntity(
    approvedEntity.id,
    'https://www.linkedin.com/in/spencerwang1',
  );

  assert.equal(ignored.match.reviewStatus, 'ignored');
  assert.equal(second.reusedExisting, true);
  assert.equal(harness.providerCalls, 1);
  assert.equal(second.matches.find((match) => match.id === ignored.match.id)?.reviewStatus, 'ignored');
});

test('runProfessionalProfileLookupForApprovedEntity reuses no-match results and retries failed lookups', async () => {
  const approvedEntity = buildApprovedEntity({
    id: 'cand_spencer',
    sourceRecordIds: ['src_spencer'],
    evidenceIds: ['evidence_spencer_linkedin'],
  });
  const sourceRecord = buildSourceRecord({
    id: 'src_spencer',
    rawSummary: {
      linkedin: 'https://www.linkedin.com/in/spencerwang1',
    },
  });
  const linkedInEvidence = buildEvidence({
    id: 'evidence_spencer_linkedin',
    sourceRecordId: sourceRecord.id,
    evidenceType: 'linkedin',
    rawValue: 'https://www.linkedin.com/in/spencerwang1',
    normalizedValue: 'https://www.linkedin.com/in/spencerwang1',
    valueHash: 'linkedin-spencer-hash',
    quality: 'medium',
  });
  let harness = buildVendorLookupHarness({
    approvedEntity,
    sourceRecords: [sourceRecord],
    evidence: [linkedInEvidence],
    providerResults: [noMatchLookupResult()],
  });

  const firstNoMatch = await harness.service.runProfessionalProfileLookupForApprovedEntity(
    approvedEntity.id,
    'https://www.linkedin.com/in/spencerwang1',
  );
  const secondNoMatch = await harness.service.runProfessionalProfileLookupForApprovedEntity(
    approvedEntity.id,
    'https://www.linkedin.com/in/spencerwang1',
  );

  assert.equal(firstNoMatch.run.status, 'no_match');
  assert.equal(secondNoMatch.reusedExisting, true);
  assert.equal(harness.providerCalls, 1);

  harness = buildVendorLookupHarness({
    approvedEntity,
    sourceRecords: [sourceRecord],
    evidence: [linkedInEvidence],
    providerErrors: [new Error('temporary provider failure')],
    providerResults: [successfulLookupResult()],
  });
  await assert.rejects(
    harness.service.runProfessionalProfileLookupForApprovedEntity(
      approvedEntity.id,
      'https://www.linkedin.com/in/spencerwang1',
    ),
    (error: unknown) => error instanceof VendorProfileLookupProviderError,
  );
  assert.equal(harness.vendorRuns[0]?.status, 'failed');
  const retried = await harness.service.runProfessionalProfileLookupForApprovedEntity(
    approvedEntity.id,
    'https://www.linkedin.com/in/spencerwang1',
  );

  assert.equal(retried.reusedExisting, false);
  assert.equal(retried.run.status, 'completed');
  assert.equal(harness.providerCalls, 2);
});

test('decideVendorProfileMatch approves, rejects, and ignores matches with enrichment state updates', async () => {
  const approvedEntity = buildApprovedEntity({
    id: 'cand_spencer',
    sourceRecordIds: ['src_spencer'],
    evidenceIds: ['evidence_spencer_linkedin'],
    needsEnrichment: false,
    enrichmentStatus: 'enriched',
  });
  const approvedMatch = buildVendorMatch({
    id: 'vendor_match_approved',
    approvedEntityId: approvedEntity.id,
    vendorRunId: 'vendor_run_approved',
    reviewStatus: 'pending_review',
  });
  const rejectedMatch = buildVendorMatch({
    id: 'vendor_match_rejected',
    approvedEntityId: approvedEntity.id,
    vendorRunId: 'vendor_run_rejected',
    reviewStatus: 'pending_review',
  });
  const ignoredMatch = buildVendorMatch({
    id: 'vendor_match_ignored',
    approvedEntityId: approvedEntity.id,
    vendorRunId: 'vendor_run_ignored',
    reviewStatus: 'pending_review',
  });
  const harness = buildVendorLookupHarness({
    approvedEntity,
    vendorMatches: [approvedMatch, rejectedMatch, ignoredMatch],
  });

  const approved = await harness.service.decideVendorProfileMatch(approvedMatch.id, {
    action: 'approve',
    reviewerId: 'phase65c-test',
    notes: 'Correct professional profile.',
  });
  const rejected = await harness.service.decideVendorProfileMatch(rejectedMatch.id, {
    action: 'reject',
    reviewerId: 'phase65c-test',
    notes: 'Wrong profile.',
  });
  const ignored = await harness.service.decideVendorProfileMatch(ignoredMatch.id, {
    action: 'ignore',
    reviewerId: 'phase65c-test',
    notes: 'Not enough evidence.',
  });

  assert.equal(approved.match.reviewStatus, 'approved');
  assert.equal(approved.match.approvedEvidenceId, `vendor_profile_match:${approvedMatch.id}`);
  assert.equal(approved.approvedEntity?.needsEnrichment, true);
  assert.equal(approved.approvedEntity?.enrichmentStatus, 'needs_enrichment');
  assert.equal(harness.approvedEntity?.needsEnrichment, true);
  assert.equal(rejected.match.reviewStatus, 'rejected');
  assert.equal(rejected.match.approvedEvidenceId, null);
  assert.equal(ignored.match.reviewStatus, 'ignored');
  assert.equal(ignored.match.approvedEvidenceId, null);
});

test('generateEnrichmentForApprovedEntity blocks when a pending merge overlaps the approved candidate', async () => {
  const approvedEntity = buildApprovedEntity();
  const blocker = buildCandidate({
    id: 'dedup_pending_devpost_merge',
    sourceRecordIds: ['src_github_person_alex', 'src_devpost_person_alex'],
    valueHashes: ['github-hash'],
  });
  let inferenceCalled = false;

  const repository = {
    getApprovedEntity: async (id: string) => id === approvedEntity.id ? approvedEntity : null,
    listDedupCandidates: async () => [blocker],
  } as Partial<SourcingRepositoryPort> as SourcingRepositoryPort;

  const service = new SourcingService(repository, {
    inferCandidateProfile: async () => {
      inferenceCalled = true;
      return buildEnrichmentDraft();
    },
  });

  await assert.rejects(
    service.generateEnrichmentForApprovedEntity(approvedEntity.id),
    (error: unknown) =>
      error instanceof PendingMergeReviewBlockError &&
      error.approvedEntityId === approvedEntity.id &&
      error.blockers[0]?.id === blocker.id,
  );
  assert.equal(inferenceCalled, false);
});

test('generateEnrichmentForApprovedEntity creates review item and approval materializes profile', async () => {
  const approvedEntity = buildApprovedEntity();
  const sourceRecord = buildSourceRecord();
  const evidence = buildEvidence();
  const reviewLabel = buildReviewLabel();
  const enrichmentRuns: CandidateEnrichmentRun[] = [];
  const enrichmentItemsById = new Map<string, CandidateEnrichmentReviewItem>();
  const profilesById = new Map<string, CandidateProfile>();
  const approvedEntitiesById = new Map([[approvedEntity.id, approvedEntity]]);
  const draft = buildEnrichmentDraft();

  const repository = {
    getApprovedEntity: async (id: string) => approvedEntitiesById.get(id) ?? null,
    listDedupCandidates: async () => [],
    getSourceRecordsByIds: async (ids: string[]) => [sourceRecord].filter((record) => ids.includes(record.id)),
    getEvidenceByIds: async (ids: string[]) => [evidence].filter((entry) => ids.includes(entry.id)),
    getReviewLabelsByIds: async (ids: string[]) => [reviewLabel].filter((label) => ids.includes(label.id)),
    listEnrichmentReviewItemsForApprovedEntity: async (approvedEntityId: string) =>
      [...enrichmentItemsById.values()].filter((item) => item.approvedEntityId === approvedEntityId),
    createEnrichmentRun: async (run: CandidateEnrichmentRun) => {
      enrichmentRuns.push(run);
      return run;
    },
    createEnrichmentReviewItem: async (item: CandidateEnrichmentReviewItem) => {
      enrichmentItemsById.set(item.id, item);
      return item;
    },
    getEnrichmentReviewItem: async (id: string) => enrichmentItemsById.get(id) ?? null,
    updateEnrichmentReviewItem: async (item: CandidateEnrichmentReviewItem) => {
      enrichmentItemsById.set(item.id, item);
      return item;
    },
    listEnrichmentReviewItems: async () => [...enrichmentItemsById.values()],
    upsertApprovedEntity: async (entity: ApprovedEntity) => {
      approvedEntitiesById.set(entity.id, entity);
      return entity;
    },
    getCandidateProfileByApprovedEntityId: async (approvedEntityId: string) =>
      [...profilesById.values()].find((profile) => profile.approvedEntityId === approvedEntityId) ?? null,
    upsertCandidateProfile: async (profile: CandidateProfile) => {
      profilesById.set(profile.id, profile);
      return profile;
    },
  } as Partial<SourcingRepositoryPort> as SourcingRepositoryPort;

  const service = new SourcingService(repository, {
    inferCandidateProfile: async () => draft,
  });

  const generated = await service.generateEnrichmentForApprovedEntity(approvedEntity.id);
  assert.equal(generated.enrichmentRun?.status, 'completed');
  assert.equal(generated.reviewItem.status, 'pending_review');
  assert.equal(generated.reviewItem.draft.primaryTrack, 'software_engineering');
  assert.equal(approvedEntitiesById.get(approvedEntity.id)?.enrichmentStatus, 'in_review');

  const approved = await service.submitEnrichmentReviewDecision(generated.reviewItem.id, {
    action: 'approve',
    reviewerId: 'phase5-test',
    notes: 'Looks correct.',
  });

  assert.equal(approved.reviewItem.status, 'approved');
  assert.ok(approved.candidateProfile);
  assert.equal(approved.candidateProfile.primaryTrack, 'software_engineering');
  assert.equal(approved.candidateProfile.profileVersion, 1);
  assert.equal(approvedEntitiesById.get(approvedEntity.id)?.enrichmentStatus, 'enriched');
  assert.equal(approvedEntitiesById.get(approvedEntity.id)?.needsEnrichment, false);
});

test('candidate profile listing filters matching-ready profiles and details preserve clean lineage', async () => {
  const profile = buildCandidateProfile();
  const sourceRecord = buildSourceRecord({
    raw: { largePayload: true },
    rawSummary: { github: 'https://github.com/alex', nestedPayload: true },
  });
  const evidence = buildEvidence();
  const reviewLabel = buildReviewLabel();
  const enrichmentReview: CandidateEnrichmentReviewItem = {
    id: profile.enrichmentReviewItemId,
    approvedEntityId: profile.approvedEntityId,
    enrichmentRunId: profile.enrichmentRunId,
    status: 'approved',
    evidencePackHash: 'pack-hash',
    sourceRecordIds: profile.sourceRecordIds,
    evidenceIds: profile.evidenceIds,
    reviewLabelIds: profile.reviewLabelIds,
    displayName: profile.displayName,
    draft: buildEnrichmentDraft(),
    validationWarnings: [],
    reviewerId: 'phase6-test',
    reviewNote: 'Approved labels.',
    reviewedDraft: buildEnrichmentDraft(),
    reviewedAt: '2026-04-28T00:00:00.000Z',
    createdAt: '2026-04-28T00:00:00.000Z',
    updatedAt: '2026-04-28T00:00:00.000Z',
  };

  const repository = {
    listCandidateProfiles: async () => [profile],
    getCandidateProfile: async (id: string) => id === profile.id ? profile : null,
    getApprovedEntity: async (id: string) => id === profile.approvedEntityId ? buildApprovedEntity() : null,
    getSourceRecordsByIds: async (ids: string[]) => [sourceRecord].filter((record) => ids.includes(record.id)),
    getEvidenceByIds: async (ids: string[]) => [evidence].filter((entry) => ids.includes(entry.id)),
    getReviewLabelsByIds: async (ids: string[]) => [reviewLabel].filter((label) => ids.includes(label.id)),
    getEnrichmentReviewItem: async (id: string) => id === enrichmentReview.id ? enrichmentReview : null,
  } as Partial<SourcingRepositoryPort> as SourcingRepositoryPort;

  const service = new SourcingService(repository);
  const filtered = await service.listCandidateProfiles({
    track: 'software_engineering',
    domain: 'developer_tools',
    contactability: 'medium',
    source: 'github',
    q: 'typescript',
  });

  assert.deepEqual(filtered.map((item) => item.id), [profile.id]);

  const details = await service.getCandidateProfileDetails(profile.id);
  assert.equal(details.profile.id, profile.id);
  assert.equal(details.lineage.profileVersion, 1);
  assert.equal(details.sourceRecords[0].id, sourceRecord.id);
  assert.equal('raw' in details.sourceRecords[0], false);
  assert.equal('rawSummary' in details.sourceRecords[0], false);
  assert.equal(details.fieldEvidence[0].field, 'primaryTrack');
  assert.deepEqual(details.fieldEvidence[0].evidence.map((entry) => entry.id), [evidence.id]);
  assert.equal(details.reviewLabels[0].notes, reviewLabel.notes);
  assert.equal(details.enrichmentReview?.reviewNote, 'Approved labels.');
});
