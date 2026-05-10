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
  extractLinkedInProfileUrls,
  isLinkedInProfileUrl,
  normalizeLinkedInProfileUrl,
} from './linkedin';
import {
  buildEnrichmentEvidencePack,
  buildEvidencePackHash,
  deriveDraftFieldEvidence,
  extractDeterministicFeatures,
  validateCandidateEnrichmentDraft,
  vendorProfileMatchEvidenceId,
  type EnrichmentEvidencePack,
} from './enrichment';
import {
  getOpenAISourcingEnrichmentConfig,
  OpenAISourcingEnrichmentClient,
  type SourcingEnrichmentInferencePort,
} from '../integrations/openai';
import {
  BrightDataLinkedInProvider,
  FakeProfessionalProfileLookupProvider,
  brightDataLinkedInProfilesDatasetId,
  getBrightDataLinkedInProviderConfig,
  type ProfessionalProfileLookupPort,
} from '../integrations/brightdata';
import type {
  ApprovedEntity,
  BatchUpsertSourceRecordsInput,
  CandidateEnrichmentDraft,
  CandidateEnrichmentReviewItem,
  CandidateEnrichmentReviewStatus,
  CandidateEnrichmentRun,
  CandidateProfile,
  CreateEnrichmentReviewDecisionInput,
  CreateVendorProfileMatchDecisionInput,
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
  VendorEnrichmentRun,
  VendorProfileMatch,
  VendorProfileProvider,
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function valuesFromEvidence(evidence: EvidenceRecord[], type: EvidenceRecord['evidenceType']): string[] {
  return sortedUnique(
    evidence
      .filter((entry) => entry.evidenceType === type)
      .map((entry) => entry.normalizedValue),
  );
}

function evidenceLikeIdForVendorMatch(matchId: string): string {
  return vendorProfileMatchEvidenceId(matchId);
}

function vendorMatchIdFromEvidenceId(evidenceId: string): string | null {
  return evidenceId.startsWith('vendor_profile_match:')
    ? evidenceId.slice('vendor_profile_match:'.length)
    : null;
}

const urlRegex = /https?:\/\/[^\s"'<>]+/gi;

function cleanUrlToken(value: string): string {
  return value.replace(/[),.;\]]+$/g, '');
}

function urlsFromUnknown(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return [...String(value).matchAll(urlRegex)]
      .map((match) => cleanUrlToken(match[0]))
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => urlsFromUnknown(entry));
  }
  if (isPlainRecord(value)) {
    return Object.values(value).flatMap((entry) => urlsFromUnknown(entry));
  }
  return [];
}

function valueAtPath(input: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      return current.flatMap((entry) => valueAtPath(entry, segment));
    }
    if (isPlainRecord(current)) {
      return current[segment];
    }
    return undefined;
  }, input);
}

function valuesAtPaths(record: SourceRecord, paths: string[]): unknown[] {
  return paths.map((path) => valueAtPath(record, path));
}

function buildSourceRecordLinkGroups(record: SourceRecord): SourceRecordLinkGroup[] {
  const groupInputs: Array<{ label: string; values: unknown[] }> = [
    {
      label: 'Source',
      values: [record.sourceUrl],
    },
    {
      label: 'GitHub',
      values: valuesAtPaths(record, [
        'display.github',
        'display.githubUrl',
        'rawSummary.github',
        'rawSummary.githubUrl',
        'rawSummary.projectGithubRepos',
        'raw.github',
        'raw.githubUrl',
        'raw.github_url',
        'raw.member.github',
        'raw.profile.github_url',
        'raw.profile.html_url',
        'raw.projects.projectGithubRepos',
        'raw.projects.github_repos',
        'raw.projects.githubLinks',
      ]),
    },
    {
      label: 'Devpost',
      values: valuesAtPaths(record, [
        'display.devpost',
        'rawSummary.devpost',
        'rawSummary.projectUrl',
        'raw.member.devpost',
        'raw.member.devpost_profile',
        'raw.projects.projectUrl',
        'raw.projects.project_url',
      ]),
    },
    {
      label: 'LinkedIn',
      values: valuesAtPaths(record, [
        'display.linkedin',
        'rawSummary.linkedin',
        'raw.linkedin',
        'raw.linkedinUrl',
        'raw.member.linkedin',
        'raw.member.linkedin_url',
      ]),
    },
    {
      label: 'Twitter/X',
      values: valuesAtPaths(record, [
        'display.twitter',
        'rawSummary.twitter',
        'raw.twitter',
        'raw.twitterUrl',
        'raw.member.twitter',
        'raw.member.twitter_url',
        'raw.profile.twitter_username',
      ]),
    },
    {
      label: 'Website',
      values: valuesAtPaths(record, [
        'display.homepage',
        'display.website',
        'rawSummary.homepage',
        'rawSummary.website',
        'raw.homepage',
        'raw.website',
        'raw.blog',
        'raw.member.website',
        'raw.profile.blog',
      ]),
    },
    {
      label: 'Projects/demos',
      values: valuesAtPaths(record, [
        'rawSummary.demo',
        'rawSummary.video',
        'rawSummary.allLinks',
        'rawSummary.projectUrl',
        'raw.projects.projectUrl',
        'raw.projects.project_url',
        'raw.projects.videoUrl',
        'raw.projects.video_url',
        'raw.projects.demoLinks',
        'raw.projects.demo_links',
        'raw.projects.allLinks',
        'raw.projects.all_links',
      ]),
    },
  ];

  return groupInputs
    .map(({ label, values }) => ({
      label,
      urls: sortedUnique(values.flatMap((value) => urlsFromUnknown(value))).slice(0, 12),
    }))
    .filter((group) => group.urls.length > 0);
}

function collectLinkedInUrlsFromSourceRecord(record: SourceRecord): Array<{
  url: string;
  sourceRecordId: string;
  sourcePath: string;
}> {
  const collected: Array<{ url: string; sourceRecordId: string; sourcePath: string }> = [];
  const candidates: Array<{ path: string; value: unknown }> = [
    { path: 'sourceUrl', value: record.sourceUrl },
    { path: 'display', value: record.display },
    { path: 'rawSummary', value: record.rawSummary },
    { path: 'raw', value: record.raw },
  ];

  for (const candidate of candidates) {
    for (const url of extractLinkedInProfileUrls(JSON.stringify(candidate.value ?? ''))) {
      collected.push({
        url,
        sourceRecordId: record.id,
        sourcePath: candidate.path,
      });
    }
  }
  return collected;
}

function mergeLinkedInLineage(input: {
  evidence: EvidenceRecord[];
  sourceRecords: SourceRecord[];
}): EligibleLinkedInProfileUrl[] {
  const byUrl = new Map<string, EligibleLinkedInProfileUrl>();
  const add = (url: string, lineage: { sourceRecordId?: string; evidenceId?: string; sourcePath?: string }) => {
    const canonicalUrl = normalizeLinkedInProfileUrl(url);
    if (!canonicalUrl) {
      return;
    }
    const existing = byUrl.get(canonicalUrl) ?? {
      url: canonicalUrl,
      sourceRecordIds: [],
      evidenceIds: [],
      sourcePaths: [],
    };
    byUrl.set(canonicalUrl, {
      url: canonicalUrl,
      sourceRecordIds: sortedUnique([
        ...existing.sourceRecordIds,
        ...(lineage.sourceRecordId ? [lineage.sourceRecordId] : []),
      ]),
      evidenceIds: sortedUnique([
        ...existing.evidenceIds,
        ...(lineage.evidenceId ? [lineage.evidenceId] : []),
      ]),
      sourcePaths: sortedUnique([
        ...existing.sourcePaths,
        ...(lineage.sourcePath ? [lineage.sourcePath] : []),
      ]),
    });
  };

  for (const evidence of input.evidence) {
    if (
      evidence.evidenceType === 'linkedin' ||
      evidence.evidenceType === 'source_url' ||
      evidence.evidenceType === 'homepage'
    ) {
      add(evidence.normalizedValue, {
        sourceRecordId: evidence.sourceRecordId,
        evidenceId: evidence.id,
        sourcePath: evidence.extractedFrom.sourcePath,
      });
    }
  }

  for (const record of input.sourceRecords) {
    for (const item of collectLinkedInUrlsFromSourceRecord(record)) {
      add(item.url, {
        sourceRecordId: item.sourceRecordId,
        sourcePath: item.sourcePath,
      });
    }
  }

  return [...byUrl.values()].sort((left, right) => left.url.localeCompare(right.url));
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
  | 'startVendorEnrichmentRun'
  | 'getVendorEnrichmentRun'
  | 'listVendorEnrichmentRunsForApprovedEntity'
  | 'listVendorEnrichmentRunsByInputHash'
  | 'updateVendorEnrichmentRun'
  | 'upsertVendorProfileMatches'
  | 'getVendorProfileMatch'
  | 'getVendorProfileMatchesByIds'
  | 'listVendorProfileMatchesForApprovedEntity'
  | 'listVendorProfileMatchesByInputHash'
  | 'updateVendorProfileMatch'
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

export type SourceRecordLinkGroup = {
  label: string;
  urls: string[];
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
> & {
  linkGroups: SourceRecordLinkGroup[];
};

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

export type CandidateEvidenceSummary = {
  id: string;
  sourceRecordId: string;
  sourceName: string;
  sourceDomain: string;
  evidenceType: string;
  rawValue: string;
  normalizedValue: string;
  quality: string;
  extractedFrom: {
    sourcePath: string;
    sourceUrl: string | null;
  };
};

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
  evidence: CandidateEvidenceSummary[];
  fieldEvidence: Array<{
    field: string;
    evidenceIds: string[];
    evidence: CandidateEvidenceSummary[];
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
  sourceRecordSummaries: CandidateProfileSourceSummary[];
};

export type EligibleLinkedInProfileUrl = {
  url: string;
  sourceRecordIds: string[];
  evidenceIds: string[];
  sourcePaths: string[];
};

export type VendorProfileLookupState = {
  approvedEntityId: string;
  eligibleLinkedInUrls: EligibleLinkedInProfileUrl[];
  runs: VendorEnrichmentRun[];
  matches: VendorProfileMatch[];
};

export type VendorProfileLookupRunResult = VendorProfileLookupState & {
  run: VendorEnrichmentRun;
  matchesForRun: VendorProfileMatch[];
  reusedExisting: boolean;
};

export type CandidateEnrichmentReviewItemWithEvidence = CandidateEnrichmentReviewItem & {
  sourceRecordSummaries: CandidateProfileSourceSummary[];
  evidence: CandidateEvidenceSummary[];
};

export class PendingMergeReviewBlockError extends Error {
  readonly code = 'PENDING_MERGE_REVIEW';

  constructor(
    readonly approvedEntityId: string,
    readonly blockers: PendingMergeReviewBlockerSummary[],
    action = 'generating enrichment',
  ) {
    const label = blockers.length === 1 ? 'merge review' : 'merge reviews';
    super(`Resolve ${blockers.length} pending ${label} before ${action}.`);
    this.name = 'PendingMergeReviewBlockError';
  }
}

export class VendorProfileLookupValidationError extends Error {
  readonly code = 'VENDOR_PROFILE_LOOKUP_VALIDATION';

  constructor(message: string) {
    super(message);
    this.name = 'VendorProfileLookupValidationError';
  }
}

export class VendorProfileLookupProviderError extends Error {
  readonly code = 'VENDOR_PROFILE_LOOKUP_PROVIDER';

  constructor(message: string) {
    super(message);
    this.name = 'VendorProfileLookupProviderError';
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
      .filter(
        (entry) =>
          !(
            (entry.evidenceType === 'homepage' || entry.evidenceType === 'source_url') &&
            isLinkedInProfileUrl(entry.normalizedValue)
          ),
      )
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

function vendorLookupLineageHash(lineage: EligibleLinkedInProfileUrl): string {
  return stableHash(JSON.stringify({
    url: lineage.url,
    evidenceIds: lineage.evidenceIds,
    sourceRecordIds: lineage.sourceRecordIds,
    sourcePaths: lineage.sourcePaths,
  }));
}

function vendorInputUrlHash(approvedEntityId: string, lineage: EligibleLinkedInProfileUrl): string {
  return stableHash(`vendor-linkedin:${approvedEntityId}:${vendorLookupLineageHash(lineage)}`);
}

function vendorRunId(approvedEntityId: string, inputUrlHash: string): string {
  return `vendor_run_${stableHash(`brightdata:${approvedEntityId}:${inputUrlHash}`).slice(0, 24)}`;
}

function vendorMatchId(runId: string, providerRecordId: string | null, providerProfileUrl: string | null, index: number): string {
  return `vendor_match_${stableHash(`${runId}:${providerRecordId ?? ''}:${providerProfileUrl ?? ''}:${index}`).slice(0, 24)}`;
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
    linkGroups: buildSourceRecordLinkGroups(record),
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

function summarizeEvidenceRecord(entry: EvidenceRecord): CandidateEvidenceSummary {
  return {
    id: entry.id,
    sourceRecordId: entry.sourceRecordId,
    sourceName: entry.sourceName,
    sourceDomain: entry.sourceDomain,
    evidenceType: entry.evidenceType,
    rawValue: entry.rawValue,
    normalizedValue: entry.normalizedValue,
    quality: entry.quality,
    extractedFrom: entry.extractedFrom,
  };
}

function compactVendorProfileSummary(match: VendorProfileMatch): string {
  const profile = match.normalizedProfile;
  return [
    profile.name,
    profile.headline,
    profile.currentCompany ? `Current company: ${profile.currentCompany}` : null,
    profile.location ? `Location: ${profile.location}` : null,
    profile.skills.length ? `Skills: ${profile.skills.join(', ')}` : null,
    profile.experienceSummary.length ? `Experience: ${profile.experienceSummary.join('; ')}` : null,
    profile.educationSummary.length ? `Education: ${profile.educationSummary.join('; ')}` : null,
    profile.aboutSummary ? `About: ${profile.aboutSummary}` : null,
    profile.projectsPublications.length ? `Projects/publications: ${profile.projectsPublications.join('; ')}` : null,
  ].filter(Boolean).join(' | ');
}

function summarizeVendorProfileMatch(match: VendorProfileMatch): CandidateEvidenceSummary {
  const summary = compactVendorProfileSummary(match);
  return {
    id: match.approvedEvidenceId ?? evidenceLikeIdForVendorMatch(match.id),
    sourceRecordId: `vendor:${match.id}`,
    sourceName: match.provider,
    sourceDomain: 'professional_profile_vendor',
    evidenceType: 'vendor_professional_profile',
    rawValue: summary,
    normalizedValue: summary,
    quality: 'medium',
    extractedFrom: {
      sourcePath: `vendorProfileMatches.${match.id}.normalizedProfile`,
      sourceUrl: match.providerProfileUrl ?? match.normalizedProfile.profileUrl ?? match.selectedLinkedInUrl,
    },
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
    private readonly professionalProfileLookup?: ProfessionalProfileLookupPort,
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
    const sourceRecordIds = sortedUnique(approvedEntities.flatMap((entity) => entity.sourceRecordIds));
    const sourceRecords = await this.repository.getSourceRecordsByIds(sourceRecordIds);
    const sourceRecordsById = new Map(sourceRecords.map((record) => [record.id, record]));

    return approvedEntities.map((entity) => {
      const blockers = findPendingMergeBlockersForEntity(entity, pendingCandidates);
      return {
        ...entity,
        pendingMergeReviewCount: blockers.length,
        pendingMergeReviewIds: blockers.map((blocker) => blocker.id),
        pendingMergeReviewBlockers: blockers,
        sourceRecordSummaries: entity.sourceRecordIds
          .map((sourceRecordId) => sourceRecordsById.get(sourceRecordId))
          .filter((record): record is SourceRecord => Boolean(record))
          .map((record) => summarizeSourceRecord(record)),
      };
    });
  }

  async listVendorProfileMatchesForApprovedEntity(approvedEntityId: string): Promise<VendorProfileLookupState> {
    const approvedEntity = await this.repository.getApprovedEntity(approvedEntityId);
    if (!approvedEntity) {
      throw new VendorProfileLookupValidationError(`Approved entity "${approvedEntityId}" was not found.`);
    }
    return this.loadVendorProfileLookupState(approvedEntity);
  }

  async runProfessionalProfileLookupForApprovedEntity(
    approvedEntityId: string,
    selectedLinkedInUrl: string,
  ): Promise<VendorProfileLookupRunResult> {
    const approvedEntity = await this.repository.getApprovedEntity(approvedEntityId);
    if (!approvedEntity) {
      throw new VendorProfileLookupValidationError(`Approved entity "${approvedEntityId}" was not found.`);
    }
    if (!isUpdatableCandidateEntity(approvedEntity)) {
      throw new VendorProfileLookupValidationError(`Approved entity "${approvedEntityId}" is not active.`);
    }

    const pendingMergeBlockers = findPendingMergeBlockersForEntity(
      approvedEntity,
      await this.repository.listDedupCandidates('pending_review'),
    );
    if (pendingMergeBlockers.length > 0) {
      throw new PendingMergeReviewBlockError(approvedEntity.id, pendingMergeBlockers, 'running LinkedIn profile lookup');
    }

    const canonicalUrl = normalizeLinkedInProfileUrl(selectedLinkedInUrl);
    if (!canonicalUrl) {
      throw new VendorProfileLookupValidationError('Bright Data lookup requires a linkedin.com/in/... profile URL.');
    }

    const state = await this.loadVendorProfileLookupState(approvedEntity);
    const selectedLineage = state.eligibleLinkedInUrls.find((entry) => entry.url === canonicalUrl);
    if (!selectedLineage) {
      throw new VendorProfileLookupValidationError(
        state.eligibleLinkedInUrls.length === 0
          ? `Approved entity "${approvedEntityId}" has no eligible LinkedIn profile URL in approved source/evidence lineage.`
          : 'Selected LinkedIn URL is not present in this approved entity source/evidence lineage.',
      );
    }

    const inputUrlHash = vendorInputUrlHash(approvedEntity.id, selectedLineage);
    const existingReusableRun = state.runs
      .filter((run) => run.inputUrlHash === inputUrlHash && run.status !== 'failed')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    if (existingReusableRun) {
      const matchesForRun = state.matches.filter((match) => match.vendorRunId === existingReusableRun.id);
      return {
        ...state,
        run: existingReusableRun,
        matchesForRun,
        reusedExisting: true,
      };
    }

    const { lookup, provider, datasetId } = this.resolveProfessionalProfileLookup();
    const now = new Date().toISOString();
    const run: VendorEnrichmentRun = {
      id: vendorRunId(approvedEntity.id, inputUrlHash),
      approvedEntityId: approvedEntity.id,
      provider,
      lookupType: 'linkedin_profile_by_url',
      inputUrlHash,
      selectedLinkedInUrl: canonicalUrl,
      selectedLinkedInUrlLineage: selectedLineage,
      datasetId,
      status: 'running',
      snapshotId: null,
      matchIds: [],
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    const reserved = await this.repository.startVendorEnrichmentRun(run);
    if (!reserved.shouldCallProvider) {
      const matchesForRun = await this.repository.listVendorProfileMatchesByInputHash(
        approvedEntity.id,
        reserved.run.inputUrlHash,
      );
      return {
        ...(await this.loadVendorProfileLookupState(approvedEntity)),
        run: reserved.run,
        matchesForRun: matchesForRun.filter((match) => match.vendorRunId === reserved.run.id),
        reusedExisting: true,
      };
    }

    try {
      const result = await lookup.lookupLinkedInProfile({ linkedinUrl: canonicalUrl });
      const completedAt = new Date().toISOString();
      const matches: VendorProfileMatch[] = result.matches.map((match, index) => {
        const id = vendorMatchId(reserved.run.id, match.providerRecordId, match.providerProfileUrl, index);
        return {
          id,
          approvedEntityId: approvedEntity.id,
          vendorRunId: reserved.run.id,
          provider: result.provider,
          lookupType: result.lookupType,
          inputUrlHash,
          selectedLinkedInUrl: canonicalUrl,
          selectedLinkedInUrlLineage: selectedLineage,
          providerRecordId: match.providerRecordId,
          providerProfileUrl: match.providerProfileUrl,
          normalizedProfile: match.normalizedProfile,
          reviewStatus: 'pending_review',
          reviewerId: null,
          reviewNote: '',
          reviewedAt: null,
          approvedEvidenceId: null,
          createdAt: completedAt,
          updatedAt: completedAt,
        };
      });
      const persistedMatches = await this.repository.upsertVendorProfileMatches(matches);
      const updatedRun: VendorEnrichmentRun = {
        ...reserved.run,
        provider: result.provider,
        lookupType: result.lookupType,
        datasetId: result.datasetId,
        status: result.status,
        snapshotId: result.snapshotId,
        matchIds: persistedMatches.map((match) => match.id),
        error: null,
        updatedAt: completedAt,
      };
      await this.repository.updateVendorEnrichmentRun(updatedRun);

      return {
        ...(await this.loadVendorProfileLookupState(approvedEntity)),
        run: updatedRun,
        matchesForRun: persistedMatches,
        reusedExisting: false,
      };
    } catch (error) {
      const failedAt = new Date().toISOString();
      await this.repository.updateVendorEnrichmentRun({
        ...reserved.run,
        status: 'failed',
        error: this.sanitizedProviderError(error),
        updatedAt: failedAt,
      });
      throw new VendorProfileLookupProviderError(this.sanitizedProviderError(error));
    }
  }

  async decideVendorProfileMatch(
    matchId: string,
    input: CreateVendorProfileMatchDecisionInput,
  ): Promise<{
    match: VendorProfileMatch;
    approvedEntity: ApprovedEntity | null;
  }> {
    const match = await this.repository.getVendorProfileMatch(matchId);
    if (!match) {
      throw new VendorProfileLookupValidationError(`Vendor profile match "${matchId}" was not found.`);
    }
    const status = input.action === 'ignore' ? 'ignored' : input.action === 'reject' ? 'rejected' : 'approved';
    if (match.reviewStatus !== 'pending_review') {
      if (match.reviewStatus === status) {
        return {
          match,
          approvedEntity: await this.repository.getApprovedEntity(match.approvedEntityId),
        };
      }
      throw new VendorProfileLookupValidationError(`Vendor profile match "${matchId}" is already ${match.reviewStatus}.`);
    }

    const now = new Date().toISOString();
    const updatedMatch: VendorProfileMatch = {
      ...match,
      reviewStatus: status,
      reviewerId: input.reviewerId,
      reviewNote: input.notes,
      reviewedAt: now,
      approvedEvidenceId: status === 'approved' ? evidenceLikeIdForVendorMatch(match.id) : null,
      updatedAt: now,
    };
    await this.repository.updateVendorProfileMatch(updatedMatch);

    const approvedEntity = await this.repository.getApprovedEntity(match.approvedEntityId);
    if (approvedEntity && status === 'approved') {
      const nextEntity: ApprovedEntity = {
        ...approvedEntity,
        needsEnrichment: true,
        enrichmentStatus: approvedEntity.enrichmentStatus === 'enriched'
          ? 'needs_enrichment'
          : approvedEntity.enrichmentStatus,
        updatedAt: now,
      };
      await this.repository.upsertApprovedEntity(nextEntity);
      return {
        match: updatedMatch,
        approvedEntity: nextEntity,
      };
    }

    return {
      match: updatedMatch,
      approvedEntity,
    };
  }

  async refreshProfessionalProfileLookupRun(runId: string): Promise<VendorProfileLookupRunResult> {
    const run = await this.repository.getVendorEnrichmentRun(runId);
    if (!run) {
      throw new VendorProfileLookupValidationError(`Vendor enrichment run "${runId}" was not found.`);
    }
    if (run.status !== 'async_snapshot_pending') {
      const approvedEntity = await this.repository.getApprovedEntity(run.approvedEntityId);
      const state = approvedEntity
        ? await this.loadVendorProfileLookupState(approvedEntity)
        : {
          approvedEntityId: run.approvedEntityId,
          eligibleLinkedInUrls: [],
          runs: [run],
          matches: [],
        };
      return {
        ...state,
        run,
        matchesForRun: state.matches.filter((match) => match.vendorRunId === run.id),
        reusedExisting: true,
      };
    }
    if (!run.snapshotId) {
      throw new VendorProfileLookupValidationError(`Vendor enrichment run "${runId}" has no snapshot ID.`);
    }

    const approvedEntity = await this.repository.getApprovedEntity(run.approvedEntityId);
    if (!approvedEntity) {
      throw new VendorProfileLookupValidationError(`Approved entity "${run.approvedEntityId}" was not found.`);
    }
    const { lookup } = this.resolveProfessionalProfileLookup();
    if (!lookup.refreshLinkedInProfileSnapshot) {
      throw new VendorProfileLookupProviderError('Professional profile provider does not support snapshot refresh.');
    }

    try {
      const result = await lookup.refreshLinkedInProfileSnapshot({
        linkedinUrl: run.selectedLinkedInUrl,
        snapshotId: run.snapshotId,
      });
      const refreshedAt = new Date().toISOString();
      const matches: VendorProfileMatch[] = result.matches.map((match, index) => {
        const id = vendorMatchId(run.id, match.providerRecordId, match.providerProfileUrl, index);
        return {
          id,
          approvedEntityId: run.approvedEntityId,
          vendorRunId: run.id,
          provider: result.provider,
          lookupType: result.lookupType,
          inputUrlHash: run.inputUrlHash,
          selectedLinkedInUrl: run.selectedLinkedInUrl,
          selectedLinkedInUrlLineage: run.selectedLinkedInUrlLineage,
          providerRecordId: match.providerRecordId,
          providerProfileUrl: match.providerProfileUrl,
          normalizedProfile: match.normalizedProfile,
          reviewStatus: 'pending_review',
          reviewerId: null,
          reviewNote: '',
          reviewedAt: null,
          approvedEvidenceId: null,
          createdAt: refreshedAt,
          updatedAt: refreshedAt,
        };
      });
      const persistedMatches = await this.repository.upsertVendorProfileMatches(matches);
      const updatedRun: VendorEnrichmentRun = {
        ...run,
        provider: result.provider,
        lookupType: result.lookupType,
        datasetId: result.datasetId,
        status: result.status,
        snapshotId: result.snapshotId,
        matchIds: persistedMatches.map((match) => match.id),
        error: null,
        updatedAt: refreshedAt,
      };
      await this.repository.updateVendorEnrichmentRun(updatedRun);
      return {
        ...(await this.loadVendorProfileLookupState(approvedEntity)),
        run: updatedRun,
        matchesForRun: persistedMatches,
        reusedExisting: false,
      };
    } catch (error) {
      const failedAt = new Date().toISOString();
      await this.repository.updateVendorEnrichmentRun({
        ...run,
        status: 'failed',
        error: this.sanitizedProviderError(error),
        updatedAt: failedAt,
      });
      throw new VendorProfileLookupProviderError(this.sanitizedProviderError(error));
    }
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
      this.resolveEvidenceSummaries(profile.evidenceIds),
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
          evidence: evidenceIds
            .map((id) => evidenceById.get(id))
            .filter((entry): entry is CandidateEvidenceSummary => Boolean(entry)),
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

    const evidencePack = await this.buildCurrentEnrichmentEvidencePack(approvedEntity);
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
      const evidencePackEvidenceIds = evidencePack.evidence.map((entry) => entry.id);
      const { draft, warnings } = validateCandidateEnrichmentDraft(
        deriveDraftFieldEvidence(rawDraft),
        evidencePackEvidenceIds,
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
        evidenceIds: evidencePackEvidenceIds,
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
  ): Promise<CandidateEnrichmentReviewItemWithEvidence[]> {
    const items = await this.repository.listEnrichmentReviewItems(status);
    const sourceRecordIds = sortedUnique(items.flatMap((item) => item.sourceRecordIds));
    const evidenceIds = sortedUnique(items.flatMap((item) => item.evidenceIds));
    const [sourceRecords, evidence] = await Promise.all([
      this.repository.getSourceRecordsByIds(sourceRecordIds),
      this.resolveEvidenceSummaries(evidenceIds),
    ]);
    const sourceRecordsById = new Map(sourceRecords.map((record) => [record.id, record]));
    const evidenceById = new Map(evidence.map((entry) => [entry.id, entry]));

    return items.map((item) => ({
      ...item,
      sourceRecordSummaries: item.sourceRecordIds
        .map((sourceRecordId) => sourceRecordsById.get(sourceRecordId))
        .filter((record): record is SourceRecord => Boolean(record))
        .map((record) => summarizeSourceRecord(record)),
      evidence: item.evidenceIds
        .map((evidenceId) => evidenceById.get(evidenceId))
        .filter((entry): entry is CandidateEvidenceSummary => Boolean(entry)),
    }));
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

    const approvedEntity = await this.repository.getApprovedEntity(reviewItem.approvedEntityId);
    if (!approvedEntity) {
      throw new Error(`Approved entity "${reviewItem.approvedEntityId}" was not found.`);
    }
    const currentEvidencePackHash = buildEvidencePackHash(
      await this.buildCurrentEnrichmentEvidencePack(approvedEntity),
    );
    if (currentEvidencePackHash !== reviewItem.evidencePackHash) {
      throw new Error(
        `Enrichment review item "${reviewItemId}" is stale because approved evidence changed. Generate a fresh enrichment draft.`,
      );
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

  private async buildCurrentEnrichmentEvidencePack(approvedEntity: ApprovedEntity): Promise<EnrichmentEvidencePack> {
    const [sourceRecords, evidence, reviewLabels, vendorProfileMatches] = await Promise.all([
      this.repository.getSourceRecordsByIds(approvedEntity.sourceRecordIds),
      this.repository.getEvidenceByIds(approvedEntity.evidenceIds),
      this.repository.getReviewLabelsByIds(approvedEntity.reviewLabelIds),
      this.repository.listVendorProfileMatchesForApprovedEntity(approvedEntity.id),
    ]);
    return buildEnrichmentEvidencePack({
      approvedEntity,
      sourceRecords,
      evidence,
      reviewLabels,
      vendorProfileMatches,
    });
  }

  private async resolveEvidenceSummaries(evidenceIds: string[]): Promise<CandidateEvidenceSummary[]> {
    const uniqueEvidenceIds = sortedUnique(evidenceIds);
    const sourceEvidenceIds: string[] = [];
    const vendorMatchIds: string[] = [];
    for (const evidenceId of uniqueEvidenceIds) {
      const vendorMatchId = vendorMatchIdFromEvidenceId(evidenceId);
      if (vendorMatchId) {
        vendorMatchIds.push(vendorMatchId);
      } else {
        sourceEvidenceIds.push(evidenceId);
      }
    }

    const [sourceEvidence, vendorMatches] = await Promise.all([
      this.repository.getEvidenceByIds(sourceEvidenceIds),
      this.repository.getVendorProfileMatchesByIds(sortedUnique(vendorMatchIds)),
    ]);
    const summariesById = new Map<string, CandidateEvidenceSummary>();
    for (const entry of sourceEvidence) {
      summariesById.set(entry.id, summarizeEvidenceRecord(entry));
    }
    for (const match of vendorMatches) {
      const summary = summarizeVendorProfileMatch(match);
      summariesById.set(summary.id, summary);
    }

    return evidenceIds
      .map((evidenceId) => summariesById.get(evidenceId))
      .filter((entry): entry is CandidateEvidenceSummary => Boolean(entry));
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

  private resolveProfessionalProfileLookup(): {
    lookup: ProfessionalProfileLookupPort;
    provider: VendorProfileProvider;
    datasetId: string;
  } {
    if (this.professionalProfileLookup) {
      return {
        lookup: this.professionalProfileLookup,
        provider: 'fake',
        datasetId: 'fake-linkedin-profiles',
      };
    }
    if (
      process.env.SOURCING_PROFESSIONAL_PROFILE_PROVIDER === 'fake' ||
      (process.env.FUNCTIONS_EMULATOR === 'true' && process.env.SOURCING_PROFESSIONAL_PROFILE_PROVIDER !== 'brightdata')
    ) {
      return {
        lookup: new FakeProfessionalProfileLookupProvider(),
        provider: 'fake',
        datasetId: 'fake-linkedin-profiles',
      };
    }
    const config = getBrightDataLinkedInProviderConfig();
    return {
      lookup: new BrightDataLinkedInProvider(config),
      provider: 'brightdata',
      datasetId: config.datasetId ?? brightDataLinkedInProfilesDatasetId,
    };
  }

  private sanitizedProviderError(error: unknown): string {
    if (!(error instanceof Error)) {
      return 'Professional profile lookup failed.';
    }
    const redacted = error.message
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+/gi, 'Bearer [redacted]')
      .replace(/BRIGHTDATA_API_KEY=[^\s]+/g, 'BRIGHTDATA_API_KEY=[redacted]');
    return redacted || 'Professional profile lookup failed.';
  }

  private async loadVendorProfileLookupState(approvedEntity: ApprovedEntity): Promise<VendorProfileLookupState> {
    const [sourceRecords, evidence, runs, matches] = await Promise.all([
      this.repository.getSourceRecordsByIds(approvedEntity.sourceRecordIds),
      this.repository.getEvidenceByIds(approvedEntity.evidenceIds),
      this.repository.listVendorEnrichmentRunsForApprovedEntity(approvedEntity.id),
      this.repository.listVendorProfileMatchesForApprovedEntity(approvedEntity.id),
    ]);
    return {
      approvedEntityId: approvedEntity.id,
      eligibleLinkedInUrls: mergeLinkedInLineage({
        sourceRecords,
        evidence,
      }),
      runs,
      matches,
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
