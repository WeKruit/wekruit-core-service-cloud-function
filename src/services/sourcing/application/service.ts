import { randomUUID } from 'node:crypto';

import {
  buildEvidenceDedupCandidate,
  buildNameInstitutionDedupCandidate,
  buildSingletonReviewCandidate,
} from './dedup';
import {
  buildNameInstitutionKey,
  extractEvidenceFromSourceRecord,
  stableHash,
} from './extraction';
import {
  buildEnrichmentEvidencePack,
  buildEvidencePackHash,
  deriveDraftFieldEvidence,
  extractDeterministicFeatures,
  validateCandidateEnrichmentDraft,
} from './enrichment';
import {
  getOpenAISourcingEnrichmentConfig,
  OpenAISourcingEnrichmentClient,
  type SourcingEnrichmentInferencePort,
} from '../integrations/openai';
import type {
  ApprovedEntity,
  BatchUpsertSourceRecordsInput,
  CandidateEnrichmentDraft,
  CandidateEnrichmentReviewItem,
  CandidateEnrichmentReviewStatus,
  CandidateEnrichmentRun,
  CandidateProfile,
  CreateEnrichmentReviewDecisionInput,
  SourcingCandidateDecision,
  SourcingIdentityLabel,
  SourcingReviewStatus,
  CreateReviewLabelInput,
  CreateSourceRunInput,
  DedupCandidate,
  EvidenceRecord,
  ReviewLabelRecord,
  SourceRecord,
  SourceRunRecord,
} from '../domain/records';
import { SourcingRepository } from '../repositories/sourcingRepository';

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function buildSourceRecordId(input: {
  sourceName: string;
  entityType: string;
  sourceNativeId?: string;
  sourceUrl?: string;
  displayName?: string;
}): string {
  const stableKey = [
    input.sourceName,
    input.entityType,
    input.sourceNativeId ?? '',
    input.sourceUrl ?? '',
    input.displayName ?? '',
  ].join(':');
  return stableHash(`source-record:${stableKey}`).slice(0, 32);
}

function stringFromRecord(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickDisplayField(record: {
  display?: Record<string, unknown>;
  rawSummary?: Record<string, unknown>;
}, keys: string[]): string | undefined {
  for (const key of keys) {
    const displayValue = stringFromRecord(record.display?.[key]);
    if (displayValue) {
      return displayValue;
    }
    const summaryValue = stringFromRecord(record.rawSummary?.[key]);
    if (summaryValue) {
      return summaryValue;
    }
  }
  return undefined;
}

function pickDisplayName(records: SourceRecord[]): string | null {
  return records.find((record) => Boolean(record.displayName))?.displayName ?? null;
}

function valuesFromEvidence(evidence: EvidenceRecord[], type: EvidenceRecord['evidenceType']): string[] {
  return sortedUnique(
    evidence
      .filter((entry) => entry.evidenceType === type)
      .map((entry) => entry.normalizedValue),
  );
}

const dedupStrengthRank: Record<DedupCandidate['strength'], number> = {
  weak: 0,
  medium: 1,
  strong: 2,
};

const dedupStatusRank: Record<DedupCandidate['status'], number> = {
  suppressed: 0,
  pending_review: 1,
  unsure: 2,
  not_same_person: 3,
  rejected_bad_record: 3,
  rejected_not_relevant: 3,
  same_person: 4,
  approved_candidate: 5,
};

export type SourcingRepositoryPort = Pick<
  SourcingRepository,
  | 'createSourceRun'
  | 'getSourceRun'
  | 'listSourceRuns'
  | 'updateSourceRun'
  | 'upsertSourceRecords'
  | 'getSourceRecordsByIds'
  | 'listSourceRecordsForRun'
  | 'countSourceRecordsForRun'
  | 'upsertEvidence'
  | 'getEvidenceByIds'
  | 'listEvidenceBySourceRecordIds'
  | 'listEvidenceByValueHash'
  | 'countEvidenceForRun'
  | 'upsertDedupCandidate'
  | 'getDedupCandidate'
  | 'listDedupCandidates'
  | 'countDedupCandidatesForRun'
  | 'listRecordsByNameInstitutionKey'
  | 'createReviewLabel'
  | 'markDedupCandidatesReviewed'
  | 'upsertApprovedEntity'
  | 'findApprovedEntitiesBySourceRecordIds'
  | 'findApprovedEntitiesByIdentityEvidenceHashes'
  | 'listApprovedEntities'
  | 'getApprovedEntity'
  | 'getReviewLabelsByIds'
  | 'createEnrichmentRun'
  | 'createEnrichmentReviewItem'
  | 'getEnrichmentReviewItem'
  | 'listEnrichmentReviewItems'
  | 'listEnrichmentReviewItemsForApprovedEntity'
  | 'updateEnrichmentReviewItem'
  | 'upsertCandidateProfile'
  | 'listCandidateProfiles'
  | 'getCandidateProfile'
  | 'getCandidateProfileByApprovedEntityId'
>;

export type CandidateProfileListOptions = {
  limit?: number;
  status?: CandidateProfile['status'];
  track?: CandidateProfile['primaryTrack'];
  domain?: CandidateProfile['industryDomainInterests'][number]['domain'];
  source?: string;
  contactability?: CandidateProfile['contactability']['value'];
  q?: string;
};

export type CandidateProfileSourceSummary = Pick<
  SourceRecord,
  | 'id'
  | 'sourceRunId'
  | 'sourceName'
  | 'sourceDomain'
  | 'pipelineName'
  | 'entityType'
  | 'sourceNativeId'
  | 'sourceUrl'
  | 'displayName'
  | 'institution'
  | 'observedAt'
  | 'createdAt'
  | 'updatedAt'
>;

export type CandidateProfileReviewSummary = Pick<
  ReviewLabelRecord,
  | 'id'
  | 'dedupCandidateId'
  | 'identityLabel'
  | 'candidateDecision'
  | 'reviewerId'
  | 'notes'
  | 'confirmedSignals'
  | 'sourceRecordIds'
  | 'evidenceIds'
  | 'createdAt'
  | 'updatedAt'
>;

export type CandidateProfileEnrichmentReviewSummary = Pick<
  CandidateEnrichmentReviewItem,
  | 'id'
  | 'approvedEntityId'
  | 'enrichmentRunId'
  | 'status'
  | 'evidencePackHash'
  | 'reviewerId'
  | 'reviewNote'
  | 'reviewedAt'
  | 'validationWarnings'
  | 'createdAt'
  | 'updatedAt'
>;

export type CandidateProfileDetails = {
  profile: CandidateProfile;
  approvedEntity: ApprovedEntity | null;
  sourceRecords: CandidateProfileSourceSummary[];
  evidence: EvidenceRecord[];
  fieldEvidence: Array<{
    field: string;
    evidenceIds: string[];
    evidence: EvidenceRecord[];
  }>;
  reviewLabels: CandidateProfileReviewSummary[];
  enrichmentReview: CandidateProfileEnrichmentReviewSummary | null;
  lineage: {
    approvedEntityId: string;
    sourceRecordIds: string[];
    evidenceIds: string[];
    reviewLabelIds: string[];
    enrichmentRunId: string;
    enrichmentReviewItemId: string;
    schemaVersion: string;
    profileVersion: number;
  };
};

export type PendingMergeReviewBlockerSummary = Pick<
  DedupCandidate,
  'id' | 'displayName' | 'strength' | 'reasonCodes' | 'sourceRecordIds' | 'valueHashes' | 'updatedAt'
>;

export type ApprovedEntityWithReviewState = ApprovedEntity & {
  pendingMergeReviewCount: number;
  pendingMergeReviewIds: string[];
  pendingMergeReviewBlockers: PendingMergeReviewBlockerSummary[];
};

export class PendingMergeReviewBlockError extends Error {
  readonly code = 'PENDING_MERGE_REVIEW';

  constructor(
    readonly approvedEntityId: string,
    readonly blockers: PendingMergeReviewBlockerSummary[],
  ) {
    const label = blockers.length === 1 ? 'merge review' : 'merge reviews';
    super(`Resolve ${blockers.length} pending ${label} before generating enrichment.`);
    this.name = 'PendingMergeReviewBlockError';
  }
}

const strongIdentityEvidenceTypes = new Set<EvidenceRecord['evidenceType']>([
  'email',
  'orcid',
  'homepage',
  'github',
  'dblp',
  'openreview',
  'google_scholar',
  'source_url',
  'source_native_id',
]);

function buildCandidateGroupId(candidate: Pick<DedupCandidate, 'entityType' | 'sourceRecordIds'>): string {
  return stableHash(`dedup-group:${candidate.entityType}:${sortedUnique(candidate.sourceRecordIds).join(':')}`).slice(0, 32);
}

function buildCandidateGroupKey(candidate: Pick<DedupCandidate, 'entityType' | 'sourceRecordIds'>): string {
  return `${candidate.entityType}:${sortedUnique(candidate.sourceRecordIds).join(':')}`;
}

function normalizeReviewSignal(value: string): string | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_:-]/g, '');
  return /^[a-z][a-z0-9_:-]{1,79}$/.test(normalized) ? normalized : null;
}

function collectSignalValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectSignalValues(entry));
  }
  return [];
}

function suggestedSignalsFromRecord(record: SourceRecord): string[] {
  return sortedUnique(
    [
      ...collectSignalValues(record.rawSummary?.suggestedSignals),
      ...collectSignalValues(record.raw?.suggestedSignals),
      ...collectSignalValues(record.display?.suggestedSignals),
    ]
      .map((signal) => normalizeReviewSignal(signal))
      .filter((signal): signal is string => Boolean(signal)),
  );
}

function collectSuggestedSignals(records: SourceRecord[]): string[] {
  return sortedUnique(records.flatMap((record) => suggestedSignalsFromRecord(record)));
}

function identityEvidenceHashesFromEvidence(evidence: EvidenceRecord[]): string[] {
  return sortedUnique(
    evidence
      .filter((entry) => strongIdentityEvidenceTypes.has(entry.evidenceType))
      .map((entry) => entry.valueHash),
  );
}

function summarizePendingMergeBlocker(candidate: DedupCandidate): PendingMergeReviewBlockerSummary {
  return {
    id: candidate.id,
    displayName: candidate.displayName,
    strength: candidate.strength,
    reasonCodes: candidate.reasonCodes,
    sourceRecordIds: candidate.sourceRecordIds,
    valueHashes: candidate.valueHashes,
    updatedAt: candidate.updatedAt,
  };
}

function isPendingMergeCandidate(candidate: DedupCandidate): boolean {
  return (
    candidate.status === 'pending_review' &&
    candidate.sourceRecordIds.length > 1 &&
    !candidate.reasonCodes.includes('singleton_review')
  );
}

function findPendingMergeBlockersForEntity(
  approvedEntity: ApprovedEntity,
  pendingCandidates: DedupCandidate[],
): PendingMergeReviewBlockerSummary[] {
  const sourceRecordIds = new Set(approvedEntity.sourceRecordIds);
  const identityEvidenceHashes = new Set(approvedEntity.identityEvidenceHashes);

  return pendingCandidates
    .filter(isPendingMergeCandidate)
    .filter((candidate) =>
      candidate.sourceRecordIds.some((sourceRecordId) => sourceRecordIds.has(sourceRecordId)) ||
      candidate.valueHashes.some((valueHash) => identityEvidenceHashes.has(valueHash)),
    )
    .map((candidate) => summarizePendingMergeBlocker(candidate));
}

function buildGlobalCandidateId(input: {
  identityEvidenceHashes: string[];
  sourceRecordIds: string[];
}): string {
  const stableParts = input.identityEvidenceHashes.length > 0
    ? input.identityEvidenceHashes
    : input.sourceRecordIds;
  return `cand_${stableHash(`global-candidate:${stableParts.join(':')}`).slice(0, 24)}`;
}

function reviewLabelIdsForEntity(entity: ApprovedEntity | null, newReviewLabelId: string): string[] {
  if (!entity) {
    return [newReviewLabelId];
  }
  return sortedUnique([
    ...(entity.reviewLabelIds ?? []),
    entity.approvedByReviewLabelId,
    newReviewLabelId,
  ]);
}

function isUpdatableCandidateEntity(entity: ApprovedEntity): boolean {
  return !entity.status || entity.status === 'active' || entity.status === 'approved';
}

function isSingletonCandidate(candidate: DedupCandidate): boolean {
  return candidate.sourceRecordIds.length === 1 || candidate.reasonCodes.includes('singleton_review');
}

function lowerSet(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function profileMatchesText(profile: CandidateProfile, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [
    profile.displayName ?? '',
    profile.primaryTrack,
    profile.careerStage.value,
    profile.contactability.value,
    profile.matchingSummary,
    ...profile.sourceNames,
    ...profile.sourceDomains,
    ...profile.specializations.map((entry) => entry.specialization),
    ...profile.skills.map((entry) => entry.skill),
    ...profile.industryDomainInterests.map((entry) => entry.domain),
    ...profile.proposedTags.map((entry) => entry.tag),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function summarizeSourceRecord(record: SourceRecord): CandidateProfileSourceSummary {
  return {
    id: record.id,
    sourceRunId: record.sourceRunId,
    sourceName: record.sourceName,
    sourceDomain: record.sourceDomain,
    pipelineName: record.pipelineName,
    entityType: record.entityType,
    sourceNativeId: record.sourceNativeId,
    sourceUrl: record.sourceUrl,
    displayName: record.displayName,
    institution: record.institution,
    observedAt: record.observedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function summarizeReviewLabel(label: ReviewLabelRecord): CandidateProfileReviewSummary {
  return {
    id: label.id,
    dedupCandidateId: label.dedupCandidateId,
    identityLabel: label.identityLabel,
    candidateDecision: label.candidateDecision,
    reviewerId: label.reviewerId,
    notes: label.notes,
    confirmedSignals: label.confirmedSignals,
    sourceRecordIds: label.sourceRecordIds,
    evidenceIds: label.evidenceIds,
    createdAt: label.createdAt,
    updatedAt: label.updatedAt,
  };
}

function summarizeEnrichmentReview(
  item: CandidateEnrichmentReviewItem,
): CandidateProfileEnrichmentReviewSummary {
  return {
    id: item.id,
    approvedEntityId: item.approvedEntityId,
    enrichmentRunId: item.enrichmentRunId,
    status: item.status,
    evidencePackHash: item.evidencePackHash,
    reviewerId: item.reviewerId,
    reviewNote: item.reviewNote,
    reviewedAt: item.reviewedAt,
    validationWarnings: item.validationWarnings,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function resolveIdentityLabel(
  input: CreateReviewLabelInput,
  candidate: DedupCandidate,
): SourcingIdentityLabel | null {
  if (input.identityLabel !== undefined) {
    return input.identityLabel;
  }
  if (input.label) {
    return input.label;
  }
  return isSingletonCandidate(candidate) ? null : 'unsure';
}

function resolveCandidateDecision(input: CreateReviewLabelInput): SourcingCandidateDecision {
  if (input.candidateDecision) {
    return input.candidateDecision;
  }
  if (input.label === 'same_person') {
    return 'approve_candidate';
  }
  return 'unsure';
}

function statusForReview(input: {
  candidate: DedupCandidate;
  identityLabel: SourcingIdentityLabel | null;
  candidateDecision: SourcingCandidateDecision;
}): SourcingReviewStatus {
  if (
    input.candidateDecision === 'approve_candidate' &&
    (isSingletonCandidate(input.candidate) || input.identityLabel === 'same_person')
  ) {
    return 'approved_candidate';
  }
  if (input.candidateDecision === 'reject_bad_record') {
    return 'rejected_bad_record';
  }
  if (input.candidateDecision === 'reject_not_relevant') {
    return 'rejected_not_relevant';
  }
  if (input.identityLabel === 'not_same_person') {
    return 'not_same_person';
  }
  return 'unsure';
}

function shouldMaterializeApprovedEntity(input: {
  candidate: DedupCandidate;
  identityLabel: SourcingIdentityLabel | null;
  candidateDecision: SourcingCandidateDecision;
}): boolean {
  if (input.candidateDecision !== 'approve_candidate') {
    return false;
  }
  return isSingletonCandidate(input.candidate) || input.identityLabel === 'same_person';
}

function aggregateDedupCandidates(candidates: DedupCandidate[]): DedupCandidate[] {
  const groups = new Map<string, DedupCandidate>();

  for (const candidate of candidates) {
    const key = buildCandidateGroupKey(candidate);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...candidate,
        id: buildCandidateGroupId(candidate),
        reasonCodes: sortedUnique(candidate.reasonCodes),
        evidenceIds: sortedUnique(candidate.evidenceIds),
        valueHashes: sortedUnique(candidate.valueHashes),
      });
      continue;
    }

    groups.set(key, {
      ...existing,
      id: buildCandidateGroupId(existing),
      status:
        dedupStatusRank[candidate.status] > dedupStatusRank[existing.status]
          ? candidate.status
          : existing.status,
      strength:
        dedupStrengthRank[candidate.strength] > dedupStrengthRank[existing.strength]
          ? candidate.strength
          : existing.strength,
      reasonCodes: sortedUnique([...existing.reasonCodes, ...candidate.reasonCodes]),
      evidenceIds: sortedUnique([...existing.evidenceIds, ...candidate.evidenceIds]),
      valueHashes: sortedUnique([...existing.valueHashes, ...candidate.valueHashes]),
      displayName: existing.displayName ?? candidate.displayName,
      createdAt: existing.createdAt.localeCompare(candidate.createdAt) <= 0 ? existing.createdAt : candidate.createdAt,
      updatedAt: existing.updatedAt.localeCompare(candidate.updatedAt) >= 0 ? existing.updatedAt : candidate.updatedAt,
    });
  }

  return [...groups.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export class SourcingService {
  constructor(
    private readonly repository: SourcingRepositoryPort = new SourcingRepository(),
    private readonly enrichmentInference?: SourcingEnrichmentInferencePort,
  ) {}

  async createSourceRun(input: CreateSourceRunInput): Promise<SourceRunRecord> {
    const now = new Date().toISOString();
    const sourceName = input.sourceName ?? input.source;
    const sourceDomain = input.sourceDomain ?? input.domain;
    if (!sourceName) {
      throw new Error('sourceName or source is required.');
    }
    if (!sourceDomain) {
      throw new Error('sourceDomain or domain is required.');
    }
    const run: SourceRunRecord = {
      id: input.id ?? input.runId ?? randomUUID(),
      sourceName,
      sourceDomain,
      pipelineName: input.pipelineName,
      trigger: input.trigger,
      storagePath: input.storagePath,
      metadata: input.metadata,
      status: 'running',
      sourceRecordCount: 0,
      evidenceCount: 0,
      dedupCandidateCount: 0,
      startedAt: input.startedAt ?? now,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    return this.repository.createSourceRun(run);
  }

  async listSourceRuns(limit = 50): Promise<SourceRunRecord[]> {
    return this.repository.listSourceRuns(limit);
  }

  async listSourceRecordsForRun(runId: string, limit = 200): Promise<SourceRecord[]> {
    const sourceRun = await this.repository.getSourceRun(runId);
    if (!sourceRun) {
      throw new Error(`Source run "${runId}" was not found.`);
    }
    return this.repository.listSourceRecordsForRun(runId, limit);
  }

  async batchUpsertSourceRecords(input: BatchUpsertSourceRecordsInput): Promise<{
    sourceRun: SourceRunRecord;
    sourceRecords: SourceRecord[];
    evidence: EvidenceRecord[];
    dedupCandidates: DedupCandidate[];
  }> {
    const sourceRun = await this.repository.getSourceRun(input.runId);
    if (!sourceRun) {
      throw new Error(`Source run "${input.runId}" was not found.`);
    }

    const now = new Date().toISOString();
    const sourceRecords: SourceRecord[] = input.records.map((record) => {
      const displayName = record.displayName ?? pickDisplayField(record, ['name', 'displayName', 'display_name', 'title']);
      const institution = record.institution ?? pickDisplayField(record, ['institution', 'affiliation']);
      const sourceNativeId = record.sourceNativeId ?? stringFromRecord(record.rawSummary.sourceNativeId);
      const sourceUrl = record.sourceUrl ?? stringFromRecord(record.rawSummary.sourceUrl);
      const id =
        record.id ??
        record.sourceRecordId ??
        buildSourceRecordId({
          sourceName: sourceRun.sourceName,
          entityType: record.entityType,
          sourceNativeId,
          sourceUrl,
          displayName,
        });
      return {
        ...record,
        id,
        sourceNativeId,
        sourceUrl,
        displayName,
        institution,
        storagePath: record.storagePath ?? record.rawStoragePath,
        sourceRunId: sourceRun.id,
        sourceName: sourceRun.sourceName,
        sourceDomain: sourceRun.sourceDomain,
        pipelineName: sourceRun.pipelineName,
        nameInstitutionKey: buildNameInstitutionKey(displayName, institution),
        observedAt: record.observedAt ?? now,
        createdAt: record.createdAt ?? now,
        updatedAt: now,
      };
    });

    await this.repository.upsertSourceRecords(sourceRecords);

    const evidence = sourceRecords.flatMap((record) => extractEvidenceFromSourceRecord(record, now));
    await this.repository.upsertEvidence(evidence);

    const dedupCandidates = await this.generateDedupCandidates(sourceRecords, evidence, now);

    const updatedRun = await this.refreshRunCounts(sourceRun.id, now);
    return {
      sourceRun: updatedRun,
      sourceRecords,
      evidence,
      dedupCandidates,
    };
  }

  async completeSourceRun(runId: string): Promise<SourceRunRecord> {
    const sourceRun = await this.repository.getSourceRun(runId);
    if (!sourceRun) {
      throw new Error(`Source run "${runId}" was not found.`);
    }
    const now = new Date().toISOString();
    const withCounts = await this.refreshRunCounts(runId, now);
    return this.repository.updateSourceRun({
      ...withCounts,
      status: 'completed',
      completedAt: now,
      updatedAt: now,
    });
  }

  async listDedupCandidates(status?: DedupCandidate['status']): Promise<DedupCandidate[]> {
    const candidates = await this.repository.listDedupCandidates(status);
    return aggregateDedupCandidates(candidates);
  }

  async listDedupCandidateDetails(status?: DedupCandidate['status']): Promise<Array<{
    candidate: DedupCandidate;
    sourceRecords: SourceRecord[];
    evidence: EvidenceRecord[];
  }>> {
    const candidates = aggregateDedupCandidates(await this.repository.listDedupCandidates(status));
    return Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        sourceRecords: await this.repository.getSourceRecordsByIds(candidate.sourceRecordIds),
        evidence: await this.repository.getEvidenceByIds(candidate.evidenceIds),
      })),
    );
  }

  async createReviewLabel(input: CreateReviewLabelInput): Promise<{
    reviewLabel: ReviewLabelRecord;
    approvedEntity: ApprovedEntity | null;
  }> {
    const resolved = await this.resolveDedupCandidateGroup(input.dedupCandidateId);
    if (!resolved) {
      throw new Error(`Dedup candidate "${input.dedupCandidateId}" was not found.`);
    }
    const { candidate, rawCandidates } = resolved;

    const now = new Date().toISOString();
    const [sourceRecords, evidence] = await Promise.all([
      this.repository.getSourceRecordsByIds(candidate.sourceRecordIds),
      this.repository.listEvidenceBySourceRecordIds(candidate.sourceRecordIds),
    ]);
    const identityLabel = resolveIdentityLabel(input, candidate);
    const candidateDecision = resolveCandidateDecision(input);
    const suggestedSignals = collectSuggestedSignals(sourceRecords);
    const confirmedSignals = sortedUnique(
      (input.confirmedSignals === undefined ? suggestedSignals : input.confirmedSignals)
        .map((signal) => normalizeReviewSignal(signal))
        .filter((signal): signal is string => Boolean(signal)),
    );
    const reviewLabel: ReviewLabelRecord = {
      id: randomUUID(),
      dedupCandidateId: input.dedupCandidateId,
      identityLabel,
      candidateDecision,
      reviewerId: input.reviewerId,
      notes: input.notes,
      suggestedSignals,
      confirmedSignals,
      sourceRecordIds: sortedUnique(sourceRecords.map((record) => record.id)),
      evidenceIds: sortedUnique(evidence.map((entry) => entry.id)),
      createdAt: now,
      updatedAt: now,
    };
    const shouldMaterialize = shouldMaterializeApprovedEntity({ candidate, identityLabel, candidateDecision });
    const materializationTarget = shouldMaterialize
      ? await this.resolveApprovedEntityForMaterialization({
        sourceRecordIds: reviewLabel.sourceRecordIds,
        identityEvidenceHashes: identityEvidenceHashesFromEvidence(evidence),
      })
      : null;

    await this.repository.createReviewLabel(reviewLabel);
    const reviewedStatus = statusForReview({ candidate, identityLabel, candidateDecision });
    await this.repository.markDedupCandidatesReviewed(rawCandidates, reviewedStatus, now);

    if (!shouldMaterialize) {
      return { reviewLabel, approvedEntity: null };
    }

    const approvedEntity = await this.materializeApprovedEntity(candidate, reviewLabel, now, materializationTarget);
    return { reviewLabel, approvedEntity };
  }

  async listApprovedEntities(): Promise<ApprovedEntityWithReviewState[]> {
    const [approvedEntities, pendingCandidates] = await Promise.all([
      this.repository.listApprovedEntities(),
      this.repository.listDedupCandidates('pending_review'),
    ]);

    return approvedEntities.map((entity) => {
      const blockers = findPendingMergeBlockersForEntity(entity, pendingCandidates);
      return {
        ...entity,
        pendingMergeReviewCount: blockers.length,
        pendingMergeReviewIds: blockers.map((blocker) => blocker.id),
        pendingMergeReviewBlockers: blockers,
      };
    });
  }

  async listCandidateProfiles(options: CandidateProfileListOptions = {}): Promise<CandidateProfile[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 200, 500));
    const query = options.q?.trim().toLowerCase() ?? '';
    const source = options.source?.trim().toLowerCase() ?? '';
    const profiles = await this.repository.listCandidateProfiles(limit, options.status);

    return profiles.filter((profile) => {
      if (options.track && profile.primaryTrack !== options.track) {
        return false;
      }
      if (
        options.domain &&
        !profile.industryDomainInterests.some((entry) => entry.domain === options.domain)
      ) {
        return false;
      }
      if (options.contactability && profile.contactability.value !== options.contactability) {
        return false;
      }
      if (source) {
        const sourceNames = lowerSet([...profile.sourceNames, ...profile.sourceDomains]);
        if (!sourceNames.has(source)) {
          return false;
        }
      }
      return profileMatchesText(profile, query);
    });
  }

  async getCandidateProfileDetails(profileId: string): Promise<CandidateProfileDetails> {
    const profile = await this.repository.getCandidateProfile(profileId);
    if (!profile) {
      throw new Error(`Candidate profile "${profileId}" was not found.`);
    }

    const [approvedEntity, sourceRecords, evidence, reviewLabels, enrichmentReview] = await Promise.all([
      this.repository.getApprovedEntity(profile.approvedEntityId),
      this.repository.getSourceRecordsByIds(profile.sourceRecordIds),
      this.repository.getEvidenceByIds(profile.evidenceIds),
      this.repository.getReviewLabelsByIds(profile.reviewLabelIds),
      this.repository.getEnrichmentReviewItem(profile.enrichmentReviewItemId),
    ]);
    const evidenceById = new Map(evidence.map((entry) => [entry.id, entry]));

    return {
      profile,
      approvedEntity,
      sourceRecords: sourceRecords.map((record) => summarizeSourceRecord(record)),
      evidence,
      fieldEvidence: Object.entries(profile.fieldEvidence)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([field, evidenceIds]) => ({
          field,
          evidenceIds,
          evidence: evidenceIds.map((id) => evidenceById.get(id)).filter((entry): entry is EvidenceRecord => Boolean(entry)),
        })),
      reviewLabels: reviewLabels.map((label) => summarizeReviewLabel(label)),
      enrichmentReview: enrichmentReview ? summarizeEnrichmentReview(enrichmentReview) : null,
      lineage: {
        approvedEntityId: profile.approvedEntityId,
        sourceRecordIds: profile.sourceRecordIds,
        evidenceIds: profile.evidenceIds,
        reviewLabelIds: profile.reviewLabelIds,
        enrichmentRunId: profile.enrichmentRunId,
        enrichmentReviewItemId: profile.enrichmentReviewItemId,
        schemaVersion: profile.schemaVersion,
        profileVersion: profile.profileVersion,
      },
    };
  }

  async generateEnrichmentForApprovedEntity(approvedEntityId: string): Promise<{
    enrichmentRun: CandidateEnrichmentRun | null;
    reviewItem: CandidateEnrichmentReviewItem;
  }> {
    const approvedEntity = await this.repository.getApprovedEntity(approvedEntityId);
    if (!approvedEntity) {
      throw new Error(`Approved entity "${approvedEntityId}" was not found.`);
    }
    if (!isUpdatableCandidateEntity(approvedEntity)) {
      throw new Error(`Approved entity "${approvedEntityId}" is not active.`);
    }
    const pendingMergeBlockers = findPendingMergeBlockersForEntity(
      approvedEntity,
      await this.repository.listDedupCandidates('pending_review'),
    );
    if (pendingMergeBlockers.length > 0) {
      throw new PendingMergeReviewBlockError(approvedEntity.id, pendingMergeBlockers);
    }

    const [sourceRecords, evidence, reviewLabels] = await Promise.all([
      this.repository.getSourceRecordsByIds(approvedEntity.sourceRecordIds),
      this.repository.getEvidenceByIds(approvedEntity.evidenceIds),
      this.repository.getReviewLabelsByIds(approvedEntity.reviewLabelIds),
    ]);
    const evidencePack = buildEnrichmentEvidencePack({
      approvedEntity,
      sourceRecords,
      evidence,
      reviewLabels,
    });
    const evidencePackHash = buildEvidencePackHash(evidencePack);
    const existingReviewItem = (await this.repository.listEnrichmentReviewItemsForApprovedEntity(approvedEntity.id))
      .find((item) => item.status === 'pending_review' && item.evidencePackHash === evidencePackHash);
    if (existingReviewItem) {
      return {
        enrichmentRun: null,
        reviewItem: existingReviewItem,
      };
    }

    const now = new Date().toISOString();
    const deterministicFeatures = extractDeterministicFeatures(evidencePack);
    const { inference, provider, model } = this.resolveEnrichmentInference();
    const runId = `enrich_run_${randomUUID()}`;

    try {
      const rawDraft = await inference.inferCandidateProfile({
        evidencePack,
        deterministicFeatures,
      });
      const { draft, warnings } = validateCandidateEnrichmentDraft(
        deriveDraftFieldEvidence(rawDraft),
        approvedEntity.evidenceIds,
      );
      const enrichmentRun: CandidateEnrichmentRun = {
        id: runId,
        approvedEntityId: approvedEntity.id,
        status: 'completed',
        provider,
        model,
        evidencePackHash,
        evidencePack: evidencePack as unknown as Record<string, unknown>,
        deterministicFeatures,
        draft,
        validationWarnings: warnings,
        error: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.createEnrichmentRun(enrichmentRun);

      const reviewItem: CandidateEnrichmentReviewItem = {
        id: `enrich_review_${stableHash(`enrichment-review:${approvedEntity.id}:${evidencePackHash}`).slice(0, 24)}`,
        approvedEntityId: approvedEntity.id,
        enrichmentRunId: enrichmentRun.id,
        status: 'pending_review',
        evidencePackHash,
        sourceRecordIds: approvedEntity.sourceRecordIds,
        evidenceIds: approvedEntity.evidenceIds,
        reviewLabelIds: approvedEntity.reviewLabelIds,
        displayName: approvedEntity.displayName,
        draft,
        validationWarnings: warnings,
        reviewerId: null,
        reviewNote: '',
        reviewedDraft: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.createEnrichmentReviewItem(reviewItem);
      await this.repository.upsertApprovedEntity({
        ...approvedEntity,
        needsEnrichment: true,
        enrichmentStatus: 'in_review',
        updatedAt: now,
      });

      return {
        enrichmentRun,
        reviewItem,
      };
    } catch (error) {
      const enrichmentRun: CandidateEnrichmentRun = {
        id: runId,
        approvedEntityId: approvedEntity.id,
        status: 'failed',
        provider,
        model,
        evidencePackHash,
        evidencePack: evidencePack as unknown as Record<string, unknown>,
        deterministicFeatures,
        draft: null,
        validationWarnings: [],
        error: error instanceof Error ? error.message : String(error),
        createdAt: now,
        updatedAt: now,
      };
      await this.repository.createEnrichmentRun(enrichmentRun);
      throw error;
    }
  }

  async listEnrichmentReviewItems(
    status?: CandidateEnrichmentReviewStatus,
  ): Promise<CandidateEnrichmentReviewItem[]> {
    return this.repository.listEnrichmentReviewItems(status);
  }

  async submitEnrichmentReviewDecision(
    reviewItemId: string,
    input: CreateEnrichmentReviewDecisionInput,
  ): Promise<{
    reviewItem: CandidateEnrichmentReviewItem;
    candidateProfile: CandidateProfile | null;
  }> {
    const reviewItem = await this.repository.getEnrichmentReviewItem(reviewItemId);
    if (!reviewItem) {
      throw new Error(`Enrichment review item "${reviewItemId}" was not found.`);
    }
    if (reviewItem.status !== 'pending_review') {
      throw new Error(`Enrichment review item "${reviewItemId}" is already ${reviewItem.status}.`);
    }

    const now = new Date().toISOString();
    const reviewedAt = input.action === 'hold' ? null : now;

    if (input.action !== 'approve') {
      const updatedReviewItem: CandidateEnrichmentReviewItem = {
        ...reviewItem,
        status: input.action === 'hold' ? 'held' : 'rejected',
        reviewerId: input.reviewerId,
        reviewNote: input.notes,
        reviewedAt,
        updatedAt: now,
      };
      await this.repository.updateEnrichmentReviewItem(updatedReviewItem);
      const approvedEntity = await this.repository.getApprovedEntity(reviewItem.approvedEntityId);
      if (approvedEntity && input.action === 'reject') {
        await this.repository.upsertApprovedEntity({
          ...approvedEntity,
          needsEnrichment: true,
          enrichmentStatus: 'needs_enrichment',
          updatedAt: now,
        });
      }
      return {
        reviewItem: updatedReviewItem,
        candidateProfile: null,
      };
    }

    const { draft, warnings } = validateCandidateEnrichmentDraft(
      deriveDraftFieldEvidence(input.reviewedDraft ?? reviewItem.draft),
      reviewItem.evidenceIds,
    );
    const candidateProfile = await this.materializeCandidateProfile(reviewItem, draft, now);
    const updatedReviewItem: CandidateEnrichmentReviewItem = {
      ...reviewItem,
      status: 'approved',
      reviewerId: input.reviewerId,
      reviewNote: input.notes,
      reviewedDraft: draft,
      reviewedAt,
      validationWarnings: sortedUnique([...reviewItem.validationWarnings, ...warnings]),
      updatedAt: now,
    };
    await this.repository.updateEnrichmentReviewItem(updatedReviewItem);

    const approvedEntity = await this.repository.getApprovedEntity(reviewItem.approvedEntityId);
    if (approvedEntity) {
      await this.repository.upsertApprovedEntity({
        ...approvedEntity,
        needsEnrichment: false,
        enrichmentStatus: 'enriched',
        updatedAt: now,
      });
    }

    return {
      reviewItem: updatedReviewItem,
      candidateProfile,
    };
  }

  private resolveEnrichmentInference(): {
    inference: SourcingEnrichmentInferencePort;
    provider: string;
    model: string;
  } {
    if (this.enrichmentInference) {
      return {
        inference: this.enrichmentInference,
        provider: 'test',
        model: 'test-model',
      };
    }
    const config = getOpenAISourcingEnrichmentConfig();
    return {
      inference: new OpenAISourcingEnrichmentClient(config),
      provider: 'openai',
      model: config.model,
    };
  }

  private async materializeCandidateProfile(
    reviewItem: CandidateEnrichmentReviewItem,
    draft: CandidateEnrichmentDraft,
    now: string,
  ): Promise<CandidateProfile> {
    const approvedEntity = await this.repository.getApprovedEntity(reviewItem.approvedEntityId);
    if (!approvedEntity) {
      throw new Error(`Approved entity "${reviewItem.approvedEntityId}" was not found.`);
    }
    const existingProfile = await this.repository.getCandidateProfileByApprovedEntityId(approvedEntity.id);
    const profile: CandidateProfile = {
      id: existingProfile?.id ?? `profile_${approvedEntity.id}`,
      approvedEntityId: approvedEntity.id,
      enrichmentRunId: reviewItem.enrichmentRunId,
      enrichmentReviewItemId: reviewItem.id,
      schemaVersion: 'candidate-profile-v1',
      profileVersion: (existingProfile?.profileVersion ?? 0) + 1,
      status: 'active',
      displayName: approvedEntity.displayName,
      sourceNames: approvedEntity.sourceNames,
      sourceDomains: approvedEntity.sourceDomains,
      sourceRecordIds: reviewItem.sourceRecordIds,
      evidenceIds: reviewItem.evidenceIds,
      reviewLabelIds: reviewItem.reviewLabelIds,
      primaryTrack: draft.primaryTrack,
      scoredTracks: draft.scoredTracks,
      specializations: draft.specializations,
      skills: draft.skills,
      industryDomainInterests: draft.industryDomainInterests,
      careerStage: draft.careerStage,
      contactability: draft.contactability,
      matchingSummary: draft.matchingSummary,
      fieldEvidence: draft.fieldEvidence,
      proposedTags: draft.proposedTags,
      createdAt: existingProfile?.createdAt ?? now,
      updatedAt: now,
    };
    return this.repository.upsertCandidateProfile(profile);
  }

  private async refreshRunCounts(runId: string, now: string): Promise<SourceRunRecord> {
    const sourceRun = await this.repository.getSourceRun(runId);
    if (!sourceRun) {
      throw new Error(`Source run "${runId}" was not found.`);
    }
    const [sourceRecordCount, evidenceCount, dedupCandidateCount] = await Promise.all([
      this.repository.countSourceRecordsForRun(runId),
      this.repository.countEvidenceForRun(runId),
      this.repository.countDedupCandidatesForRun(runId),
    ]);
    return this.repository.updateSourceRun({
      ...sourceRun,
      sourceRecordCount,
      evidenceCount,
      dedupCandidateCount,
      updatedAt: now,
    });
  }

  private async generateDedupCandidates(
    sourceRecords: SourceRecord[],
    evidence: EvidenceRecord[],
    now: string,
  ): Promise<DedupCandidate[]> {
    const generated: DedupCandidate[] = [];

    for (const evidenceEntry of evidence) {
      const matchingEvidence = await this.repository.listEvidenceByValueHash(evidenceEntry.valueHash);
      const matchingRecords = await this.repository.getSourceRecordsByIds(
        sortedUnique(matchingEvidence.map((entry) => entry.sourceRecordId)),
      );
      const candidate = buildEvidenceDedupCandidate({
        seed: evidenceEntry,
        matchingEvidence,
        recordsById: new Map(matchingRecords.map((record) => [record.id, record])),
        now,
      });
      if (candidate) {
        generated.push(candidate);
      }
    }

    for (const sourceRecord of sourceRecords) {
      if (!sourceRecord.nameInstitutionKey) {
        continue;
      }
      const matchingRecords = await this.repository.listRecordsByNameInstitutionKey(sourceRecord.nameInstitutionKey);
      const matchingEvidence = await this.repository.listEvidenceBySourceRecordIds(
        matchingRecords.map((record) => record.id),
      );
      const candidate = buildNameInstitutionDedupCandidate({
        nameInstitutionKey: sourceRecord.nameInstitutionKey,
        sourceRunId: sourceRecord.sourceRunId,
        matchingRecords,
        evidence: matchingEvidence,
        now,
      });
      if (candidate) {
        generated.push(candidate);
      }
    }

    const groupedCandidates = aggregateDedupCandidates(generated);
    const multiRecordSourceIds = new Set(
      groupedCandidates
        .filter((candidate) => candidate.sourceRecordIds.length > 1)
        .flatMap((candidate) => candidate.sourceRecordIds),
    );

    const existingCandidates = await this.repository.listDedupCandidates();
    const staleSingletonCandidates = existingCandidates.filter(
      (candidate) =>
        candidate.status === 'pending_review' &&
        candidate.reasonCodes.includes('singleton_review') &&
        candidate.sourceRecordIds.some((sourceRecordId) => multiRecordSourceIds.has(sourceRecordId)),
    );

    if (staleSingletonCandidates.length > 0) {
      await this.repository.markDedupCandidatesReviewed(staleSingletonCandidates, 'suppressed', now);
    }

    const singletonCandidates = sourceRecords
      .filter((record) => !multiRecordSourceIds.has(record.id))
      .map((record) =>
        buildSingletonReviewCandidate({
          sourceRecord: record,
          evidence: evidence.filter((entry) => entry.sourceRecordId === record.id),
          now,
        }),
      )
      .filter((candidate): candidate is DedupCandidate => Boolean(candidate));

    const dedupCandidatesToPersist = aggregateDedupCandidates([...groupedCandidates, ...singletonCandidates]);
    return Promise.all(
      dedupCandidatesToPersist.map((candidate) => this.repository.upsertDedupCandidate(candidate)),
    );
  }

  private async resolveDedupCandidateGroup(
    candidateId: string,
  ): Promise<{ candidate: DedupCandidate; rawCandidates: DedupCandidate[] } | null> {
    const allCandidates = await this.repository.listDedupCandidates();
    const direct = allCandidates.find((candidate) => candidate.id === candidateId);

    if (direct) {
      const groupKey = buildCandidateGroupKey(direct);
      const rawCandidates = allCandidates.filter((candidate) => buildCandidateGroupKey(candidate) === groupKey);
      return {
        candidate: aggregateDedupCandidates(rawCandidates)[0] ?? {
          ...direct,
          id: buildCandidateGroupId(direct),
        },
        rawCandidates,
      };
    }

    const groupedCandidate = aggregateDedupCandidates(allCandidates).find(
      (candidate) => candidate.id === candidateId,
    );
    if (!groupedCandidate) {
      return null;
    }

    const rawCandidates = allCandidates.filter(
      (candidate) => buildCandidateGroupKey(candidate) === buildCandidateGroupKey(groupedCandidate),
    );
    return {
      candidate: groupedCandidate,
      rawCandidates,
    };
  }

  private async materializeApprovedEntity(
    candidate: DedupCandidate,
    reviewLabel: ReviewLabelRecord,
    now: string,
    resolvedEntity?: ApprovedEntity | null,
  ): Promise<ApprovedEntity> {
    const [sourceRecords, evidence] = await Promise.all([
      this.repository.getSourceRecordsByIds(candidate.sourceRecordIds),
      this.repository.listEvidenceBySourceRecordIds(candidate.sourceRecordIds),
    ]);
    const sourceRecordIds = sortedUnique(sourceRecords.map((record) => record.id));
    const evidenceIds = sortedUnique(evidence.map((entry) => entry.id));
    const identityEvidenceHashes = identityEvidenceHashesFromEvidence(evidence);
    const existingEntity = resolvedEntity === undefined
      ? await this.resolveApprovedEntityForMaterialization({
        sourceRecordIds,
        identityEvidenceHashes,
      })
      : resolvedEntity;
    const entityId = existingEntity?.id ?? buildGlobalCandidateId({ identityEvidenceHashes, sourceRecordIds });

    const approvedEntity: ApprovedEntity = {
      id: entityId,
      entityType: candidate.entityType,
      status: 'active',
      schemaVersion: 'global-candidate-v1',
      sourceRecordIds: sortedUnique([...(existingEntity?.sourceRecordIds ?? []), ...sourceRecordIds]),
      evidenceIds: sortedUnique([...(existingEntity?.evidenceIds ?? []), ...evidenceIds]),
      sourceNames: sortedUnique([
        ...(existingEntity?.sourceNames ?? []),
        ...sourceRecords.map((record) => record.sourceName),
      ]),
      sourceDomains: sortedUnique([
        ...(existingEntity?.sourceDomains ?? []),
        ...sourceRecords.map((record) => record.sourceDomain),
      ]),
      reviewLabelIds: reviewLabelIdsForEntity(existingEntity, reviewLabel.id),
      identityEvidenceHashes: sortedUnique([
        ...(existingEntity?.identityEvidenceHashes ?? []),
        ...identityEvidenceHashes,
      ]),
      approvedByReviewLabelId: reviewLabel.id,
      displayName: existingEntity?.displayName ?? candidate.displayName ?? pickDisplayName(sourceRecords),
      emails: sortedUnique([...(existingEntity?.emails ?? []), ...valuesFromEvidence(evidence, 'email')]),
      homepages: sortedUnique([...(existingEntity?.homepages ?? []), ...valuesFromEvidence(evidence, 'homepage')]),
      githubUrls: sortedUnique([...(existingEntity?.githubUrls ?? []), ...valuesFromEvidence(evidence, 'github')]),
      orcids: sortedUnique([...(existingEntity?.orcids ?? []), ...valuesFromEvidence(evidence, 'orcid')]),
      institutions: sortedUnique([...(existingEntity?.institutions ?? []), ...valuesFromEvidence(evidence, 'institution')]),
      suggestedSignals: sortedUnique([...(existingEntity?.suggestedSignals ?? []), ...reviewLabel.suggestedSignals]),
      confirmedSignals: sortedUnique([...(existingEntity?.confirmedSignals ?? []), ...reviewLabel.confirmedSignals]),
      needsEnrichment: true,
      enrichmentStatus: existingEntity?.enrichmentStatus === 'enriched' ? 'needs_enrichment' : existingEntity?.enrichmentStatus ?? 'not_started',
      mergedIntoCandidateId: existingEntity?.mergedIntoCandidateId ?? null,
      mergedByReviewId: existingEntity?.mergedByReviewId ?? null,
      mergedAt: existingEntity?.mergedAt ?? null,
      createdAt: existingEntity?.createdAt ?? now,
      updatedAt: now,
    };

    return this.repository.upsertApprovedEntity(approvedEntity);
  }

  private async resolveApprovedEntityForMaterialization(input: {
    sourceRecordIds: string[];
    identityEvidenceHashes: string[];
  }): Promise<ApprovedEntity | null> {
    const [bySourceRecord, byIdentityEvidence] = await Promise.all([
      this.repository.findApprovedEntitiesBySourceRecordIds(input.sourceRecordIds),
      this.repository.findApprovedEntitiesByIdentityEvidenceHashes(input.identityEvidenceHashes),
    ]);
    const candidates = [...new Map(
      [...bySourceRecord, ...byIdentityEvidence]
        .filter(isUpdatableCandidateEntity)
        .map((entity) => [entity.id, entity]),
    ).values()].sort((left, right) => {
      const createdDelta = left.createdAt.localeCompare(right.createdAt);
      return createdDelta === 0 ? left.id.localeCompare(right.id) : createdDelta;
    });

    if (candidates.length > 1) {
      throw new Error(
        `Multiple active global candidates matched this approved evidence: ${candidates.map((entity) => entity.id).join(', ')}.`,
      );
    }

    return candidates[0] ?? null;
  }
}
