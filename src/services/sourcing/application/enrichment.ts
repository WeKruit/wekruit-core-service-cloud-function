import { stableHash } from './extraction';
import {
  candidateEnrichmentDraftSchema,
  type ApprovedEntity,
  type CandidateEnrichmentDraft,
  type EvidenceRecord,
  type ReviewLabelRecord,
  type SourceRecord,
} from '../domain/records';

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => stringList(entry));
  }
  return [];
}

function pickString(record: SourceRecord, keys: string[]): string | null {
  for (const key of keys) {
    const direct = stringValue(record.display?.[key])
      ?? stringValue(record.rawSummary?.[key])
      ?? stringValue(record.raw?.[key]);
    if (direct) {
      return direct;
    }
  }
  return null;
}

function pickStrings(record: SourceRecord, keys: string[]): string[] {
  return sortedUnique(keys.flatMap((key) => [
    ...stringList(record.display?.[key]),
    ...stringList(record.rawSummary?.[key]),
    ...stringList(record.raw?.[key]),
  ]));
}

function compactObject(input: Record<string, unknown>, limit = 36): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input).slice(0, limit)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.slice(0, 12);
    }
  }
  return result;
}

export interface EnrichmentEvidencePack {
  schemaVersion: 'candidate-enrichment-evidence-pack-v1';
  approvedEntity: {
    id: string;
    displayName: string | null;
    entityType: string;
    sourceNames: string[];
    sourceDomains: string[];
    confirmedSignals: string[];
    emails: string[];
    homepages: string[];
    githubUrls: string[];
    orcids: string[];
    institutions: string[];
  };
  sourceFacts: Array<{
    sourceRecordId: string;
    sourceName: string;
    sourceDomain: string;
    sourceUrl: string | null;
    displayName: string | null;
    institution: string | null;
    title: string | null;
    description: string | null;
    tags: string[];
    languages: string[];
    topics: string[];
    rawSummary: Record<string, unknown>;
    display: Record<string, unknown>;
  }>;
  evidence: Array<{
    id: string;
    sourceRecordId: string;
    sourceName: string;
    sourceDomain: string;
    evidenceType: string;
    normalizedValue: string;
    rawValue: string;
    quality: string;
    sourcePath: string;
    sourceUrl: string | null;
  }>;
  reviewLabels: Array<{
    id: string;
    candidateDecision: string;
    identityLabel: string | null;
    confirmedSignals: string[];
    notes: string;
    createdAt: string;
  }>;
}

export function buildEnrichmentEvidencePack(input: {
  approvedEntity: ApprovedEntity;
  sourceRecords: SourceRecord[];
  evidence: EvidenceRecord[];
  reviewLabels: ReviewLabelRecord[];
}): EnrichmentEvidencePack {
  const approvedEvidenceIds = new Set(input.approvedEntity.evidenceIds);
  const approvedSourceRecordIds = new Set(input.approvedEntity.sourceRecordIds);
  const evidence = input.evidence.filter((entry) =>
    approvedEvidenceIds.has(entry.id) && approvedSourceRecordIds.has(entry.sourceRecordId),
  );
  const sourceRecords = input.sourceRecords.filter((record) => approvedSourceRecordIds.has(record.id));
  const reviewLabelIds = new Set(input.approvedEntity.reviewLabelIds);

  return {
    schemaVersion: 'candidate-enrichment-evidence-pack-v1',
    approvedEntity: {
      id: input.approvedEntity.id,
      displayName: input.approvedEntity.displayName,
      entityType: input.approvedEntity.entityType,
      sourceNames: input.approvedEntity.sourceNames,
      sourceDomains: input.approvedEntity.sourceDomains,
      confirmedSignals: input.approvedEntity.confirmedSignals,
      emails: input.approvedEntity.emails,
      homepages: input.approvedEntity.homepages,
      githubUrls: input.approvedEntity.githubUrls,
      orcids: input.approvedEntity.orcids,
      institutions: input.approvedEntity.institutions,
    },
    sourceFacts: sourceRecords.map((record) => ({
      sourceRecordId: record.id,
      sourceName: record.sourceName,
      sourceDomain: record.sourceDomain,
      sourceUrl: record.sourceUrl ?? null,
      displayName: record.displayName ?? null,
      institution: record.institution ?? null,
      title: pickString(record, ['title', 'projectTitle', 'paperTitle', 'name']),
      description: pickString(record, ['description', 'summary', 'abstract', 'bio']),
      tags: pickStrings(record, ['tags', 'topics', 'skills', 'suggestedSignals']),
      languages: pickStrings(record, ['languages', 'programmingLanguages', 'repoLanguages']),
      topics: pickStrings(record, ['topics', 'researchTopics', 'domains', 'interests']),
      rawSummary: compactObject(record.rawSummary),
      display: compactObject(record.display),
    })),
    evidence: evidence.map((entry) => ({
      id: entry.id,
      sourceRecordId: entry.sourceRecordId,
      sourceName: entry.sourceName,
      sourceDomain: entry.sourceDomain,
      evidenceType: entry.evidenceType,
      normalizedValue: entry.normalizedValue,
      rawValue: entry.rawValue,
      quality: entry.quality,
      sourcePath: entry.extractedFrom.sourcePath,
      sourceUrl: entry.extractedFrom.sourceUrl,
    })),
    reviewLabels: input.reviewLabels
      .filter((label) => reviewLabelIds.has(label.id))
      .map((label) => ({
        id: label.id,
        candidateDecision: label.candidateDecision,
        identityLabel: label.identityLabel,
        confirmedSignals: label.confirmedSignals,
        notes: label.notes,
        createdAt: label.createdAt,
      })),
  };
}

export function buildEvidencePackHash(pack: EnrichmentEvidencePack): string {
  return stableHash(JSON.stringify(pack));
}

export function extractDeterministicFeatures(pack: EnrichmentEvidencePack): Record<string, unknown> {
  const signals = new Set(pack.approvedEntity.confirmedSignals);
  const sourceNames = new Set(pack.approvedEntity.sourceNames.map((source) => source.toLowerCase()));
  const sourceDomains = new Set(pack.approvedEntity.sourceDomains.map((domain) => domain.toLowerCase()));
  const hasResearch = sourceDomains.has('research') || pack.approvedEntity.orcids.length > 0;
  const hasGithub = sourceNames.has('github') || pack.approvedEntity.githubUrls.length > 0;
  const hasDevpost = sourceNames.has('devpost');

  return {
    sourceCoverage: {
      sourceNames: [...sourceNames].sort(),
      sourceDomains: [...sourceDomains].sort(),
      hasGithub,
      hasDevpost,
      hasResearch,
    },
    contactSignals: {
      emails: pack.approvedEntity.emails.length,
      homepages: pack.approvedEntity.homepages.length,
      githubUrls: pack.approvedEntity.githubUrls.length,
      orcids: pack.approvedEntity.orcids.length,
    },
    likelyTrackHints: sortedUnique([
      ...(hasGithub ? ['software_engineering'] : []),
      ...(hasDevpost ? ['software_engineering', 'business_founder'] : []),
      ...(hasResearch ? ['ai_research', 'academic_research'] : []),
      ...(signals.has('open_source_contribution') ? ['software_engineering'] : []),
      ...(signals.has('hackathon_participation') ? ['software_engineering'] : []),
      ...(signals.has('research_publication') ? ['academic_research'] : []),
    ]),
    confirmedSignals: [...signals].sort(),
  };
}

function assertKnownEvidenceIds(field: string, evidenceIds: string[], availableEvidenceIds: Set<string>) {
  const unknownIds = evidenceIds.filter((id) => !availableEvidenceIds.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`${field} references evidence IDs that are not in the approved evidence pack: ${unknownIds.join(', ')}`);
  }
}

function requireEvidence(
  field: string,
  evidenceIds: string[],
  availableEvidenceIds: Set<string>,
) {
  assertKnownEvidenceIds(field, evidenceIds, availableEvidenceIds);
  if (evidenceIds.length === 0) {
    throw new Error(`${field} must include at least one approved evidence ID.`);
  }
}

export function validateCandidateEnrichmentDraft(input: unknown, approvedEvidenceIds: string[]): {
  draft: CandidateEnrichmentDraft;
  warnings: string[];
} {
  const draft = candidateEnrichmentDraftSchema.parse(input);
  const availableEvidenceIds = new Set(approvedEvidenceIds);
  const warnings: string[] = [];

  if (!draft.scoredTracks.some((track) => track.track === draft.primaryTrack)) {
    throw new Error(`Primary track "${draft.primaryTrack}" must also appear in scoredTracks.`);
  }

  for (const [field, evidenceIds] of Object.entries(draft.fieldEvidence)) {
    assertKnownEvidenceIds(`fieldEvidence.${field}`, evidenceIds, availableEvidenceIds);
  }

  for (const track of draft.scoredTracks) {
    if (track.track !== 'unknown_other') {
      requireEvidence(`scoredTracks.${track.track}`, track.evidenceIds, availableEvidenceIds);
    }
  }

  for (const specialization of draft.specializations) {
    if (specialization.specialization !== 'unknown_other') {
      requireEvidence(
        `specializations.${specialization.specialization}`,
        specialization.evidenceIds,
        availableEvidenceIds,
      );
    }
  }

  for (const skill of draft.skills) {
    requireEvidence(`skills.${skill.skill}`, skill.evidenceIds, availableEvidenceIds);
  }

  for (const interest of draft.industryDomainInterests) {
    if (interest.domain !== 'unknown_other') {
      requireEvidence(
        `industryDomainInterests.${interest.domain}`,
        interest.evidenceIds,
        availableEvidenceIds,
      );
    }
  }

  if (draft.careerStage.value !== 'unknown') {
    requireEvidence(`careerStage.${draft.careerStage.value}`, draft.careerStage.evidenceIds, availableEvidenceIds);
  }
  if (draft.contactability.value !== 'unknown') {
    requireEvidence(
      `contactability.${draft.contactability.value}`,
      draft.contactability.evidenceIds,
      availableEvidenceIds,
    );
  }

  for (const proposedTag of draft.proposedTags) {
    requireEvidence(`proposedTags.${proposedTag.tag}`, proposedTag.evidenceIds, availableEvidenceIds);
  }

  return {
    draft,
    warnings: sortedUnique([...draft.warnings, ...warnings]),
  };
}

export function deriveDraftFieldEvidence(input: unknown): CandidateEnrichmentDraft {
  const draft = candidateEnrichmentDraftSchema.parse(input);
  const trackEvidence = sortedUnique(draft.scoredTracks.flatMap((track) => track.evidenceIds));
  const primaryTrackEvidence = sortedUnique(
    draft.scoredTracks
      .filter((track) => track.track === draft.primaryTrack)
      .flatMap((track) => track.evidenceIds),
  );

  return {
    ...draft,
    fieldEvidence: {
      ...draft.fieldEvidence,
      primaryTrack: primaryTrackEvidence,
      scoredTracks: trackEvidence,
      specializations: sortedUnique(draft.specializations.flatMap((entry) => entry.evidenceIds)),
      skills: sortedUnique(draft.skills.flatMap((entry) => entry.evidenceIds)),
      industryDomainInterests: sortedUnique(draft.industryDomainInterests.flatMap((entry) => entry.evidenceIds)),
      careerStage: draft.careerStage.evidenceIds,
      contactability: draft.contactability.evidenceIds,
      matchingSummary: sortedUnique([
        ...trackEvidence,
        ...draft.specializations.flatMap((entry) => entry.evidenceIds),
        ...draft.skills.flatMap((entry) => entry.evidenceIds),
        ...draft.industryDomainInterests.flatMap((entry) => entry.evidenceIds),
        ...draft.careerStage.evidenceIds,
        ...draft.contactability.evidenceIds,
      ]),
    },
  };
}
