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
import type {
  ApprovedEntity,
  BatchUpsertSourceRecordsInput,
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
  same_person: 4,
};

function buildCandidateGroupId(candidate: Pick<DedupCandidate, 'entityType' | 'sourceRecordIds'>): string {
  return stableHash(`dedup-group:${candidate.entityType}:${sortedUnique(candidate.sourceRecordIds).join(':')}`).slice(0, 32);
}

function buildCandidateGroupKey(candidate: Pick<DedupCandidate, 'entityType' | 'sourceRecordIds'>): string {
  return `${candidate.entityType}:${sortedUnique(candidate.sourceRecordIds).join(':')}`;
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
  constructor(private readonly repository = new SourcingRepository()) {}

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
    const reviewLabel: ReviewLabelRecord = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await this.repository.createReviewLabel(reviewLabel);
    await this.repository.markDedupCandidatesReviewed(rawCandidates, input.label, now);

    if (input.label !== 'same_person') {
      return { reviewLabel, approvedEntity: null };
    }

    const approvedEntity = await this.materializeApprovedEntity(candidate, reviewLabel.id, now);
    return { reviewLabel, approvedEntity };
  }

  async listApprovedEntities(): Promise<ApprovedEntity[]> {
    return this.repository.listApprovedEntities();
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
    reviewLabelId: string,
    now: string,
  ): Promise<ApprovedEntity> {
    const [sourceRecords, evidence] = await Promise.all([
      this.repository.getSourceRecordsByIds(candidate.sourceRecordIds),
      this.repository.listEvidenceBySourceRecordIds(candidate.sourceRecordIds),
    ]);
    const sourceRecordIds = sortedUnique(sourceRecords.map((record) => record.id));
    const entityId = stableHash(`approved-person:${sourceRecordIds.join(':')}`).slice(0, 32);

    const approvedEntity: ApprovedEntity = {
      id: entityId,
      entityType: candidate.entityType,
      status: 'approved',
      sourceRecordIds,
      evidenceIds: sortedUnique(evidence.map((entry) => entry.id)),
      approvedByReviewLabelId: reviewLabelId,
      displayName: candidate.displayName ?? pickDisplayName(sourceRecords),
      emails: valuesFromEvidence(evidence, 'email'),
      homepages: valuesFromEvidence(evidence, 'homepage'),
      githubUrls: valuesFromEvidence(evidence, 'github'),
      orcids: valuesFromEvidence(evidence, 'orcid'),
      institutions: valuesFromEvidence(evidence, 'institution'),
      createdAt: now,
      updatedAt: now,
    };

    return this.repository.upsertApprovedEntity(approvedEntity);
  }
}
