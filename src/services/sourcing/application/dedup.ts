import type {
  DedupCandidate,
  EvidenceRecord,
  SourceRecord,
  SourcingDedupStrength,
} from '../domain/records';
import { stableHash } from './extraction';

const strongExactEvidenceTypes = new Set([
  'email',
  'orcid',
  'github',
  'dblp',
  'openreview',
  'google_scholar',
  'source_native_id',
]);

function reasonCodeForEvidence(evidence: EvidenceRecord): string {
  if (evidence.evidenceType === 'email') {
    return 'email_exact';
  }
  if (evidence.evidenceType === 'orcid') {
    return 'orcid_exact';
  }
  if (evidence.evidenceType === 'github') {
    return 'github_exact';
  }
  if (evidence.evidenceType === 'dblp') {
    return 'dblp_exact';
  }
  if (evidence.evidenceType === 'openreview') {
    return 'openreview_exact';
  }
  if (evidence.evidenceType === 'google_scholar') {
    return 'google_scholar_exact';
  }
  if (evidence.evidenceType === 'source_native_id') {
    return 'source_native_id_exact';
  }
  if (evidence.evidenceType === 'homepage') {
    return 'homepage_exact';
  }
  return `same_${evidence.evidenceType}`;
}

function strengthForEvidence(evidence: EvidenceRecord): SourcingDedupStrength {
  if (strongExactEvidenceTypes.has(evidence.evidenceType)) {
    return 'strong';
  }
  if (evidence.evidenceType === 'homepage') {
    return 'medium';
  }
  return 'weak';
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isPersonEntityType(entityType: SourceRecord['entityType'] | EvidenceRecord['entityType']): boolean {
  return entityType === 'person' || entityType === 'person_profile' || entityType === 'profile';
}

export function buildEvidenceDedupCandidate(input: {
  seed: EvidenceRecord;
  matchingEvidence: EvidenceRecord[];
  recordsById: Map<string, SourceRecord>;
  now?: string;
}): DedupCandidate | null {
  if (!isPersonEntityType(input.seed.entityType)) {
    return null;
  }
  if (!strongExactEvidenceTypes.has(input.seed.evidenceType) && input.seed.evidenceType !== 'homepage') {
    return null;
  }

  const relatedEvidence = input.matchingEvidence.filter((evidence) => evidence.valueHash === input.seed.valueHash);
  const sourceRecordIds = sortedUnique(relatedEvidence.map((evidence) => evidence.sourceRecordId));
  if (sourceRecordIds.length < 2) {
    return null;
  }

  const now = input.now ?? new Date().toISOString();
  const reasonCode = reasonCodeForEvidence(input.seed);
  const id = stableHash(`dedup:${reasonCode}:${sourceRecordIds.join(':')}:${input.seed.valueHash}`).slice(0, 32);
  const displayName =
    sourceRecordIds
      .map((recordId) => input.recordsById.get(recordId)?.displayName)
      .find((name): name is string => Boolean(name)) ?? null;

  return {
    id,
    entityType: input.seed.entityType,
    status: 'pending_review',
    strength: strengthForEvidence(input.seed),
    reasonCodes: [reasonCode],
    sourceRecordIds,
    evidenceIds: sortedUnique(relatedEvidence.map((evidence) => evidence.id)),
    valueHashes: [input.seed.valueHash],
    displayName,
    createdFromSourceRunId: input.seed.sourceRunId,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildNameInstitutionDedupCandidate(input: {
  nameInstitutionKey: string;
  sourceRunId: string;
  matchingRecords: SourceRecord[];
  evidence: EvidenceRecord[];
  now?: string;
}): DedupCandidate | null {
  const sourceRecordIds = sortedUnique(input.matchingRecords.map((record) => record.id));
  if (sourceRecordIds.length < 2) {
    return null;
  }

  const now = input.now ?? new Date().toISOString();
  const keyHash = stableHash(`name_institution:${input.nameInstitutionKey}`);
  const id = stableHash(`dedup:name_institution:${sourceRecordIds.join(':')}:${keyHash}`).slice(0, 32);
  const evidenceIds = sortedUnique(
    input.evidence
      .filter((evidence) => sourceRecordIds.includes(evidence.sourceRecordId))
      .filter((evidence) => evidence.evidenceType === 'name' || evidence.evidenceType === 'institution')
      .map((evidence) => evidence.id),
  );

  return {
    id,
    entityType: input.matchingRecords.find((record) => isPersonEntityType(record.entityType))?.entityType ?? 'person',
    status: 'pending_review',
    strength: 'weak',
    reasonCodes: ['name_institution'],
    sourceRecordIds,
    evidenceIds,
    valueHashes: [keyHash],
    displayName: input.matchingRecords.find((record) => Boolean(record.displayName))?.displayName ?? null,
    createdFromSourceRunId: input.sourceRunId,
    createdAt: now,
    updatedAt: now,
  };
}
