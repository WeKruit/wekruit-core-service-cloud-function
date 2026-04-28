import { z } from 'zod';

const rawObjectSchema = z.record(z.string(), z.unknown()).default({});

export const sourcingEntityTypeSchema = z.enum([
  'person',
  'person_profile',
  'paper',
  'research_work',
  'project',
  'repository',
  'organization',
  'profile',
  'generic_record',
  'other',
]);

export const sourcingEvidenceTypeSchema = z.enum([
  'email',
  'orcid',
  'homepage',
  'github',
  'dblp',
  'openreview',
  'google_scholar',
  'source_url',
  'source_native_id',
  'institution',
  'paper_doi',
  'name',
]);

export const sourcingEvidenceQualitySchema = z.enum(['high', 'medium', 'low']);
export const sourcingDedupStrengthSchema = z.enum(['strong', 'medium', 'weak']);
export const sourcingReviewLabelSchema = z.enum(['same_person', 'not_same_person', 'unsure']);
export const sourcingIdentityLabelSchema = z.enum(['same_person', 'not_same_person', 'unsure']);
export const sourcingCandidateDecisionSchema = z.enum([
  'approve_candidate',
  'reject_bad_record',
  'reject_not_relevant',
  'unsure',
]);
export const sourcingReviewStatusSchema = z.enum([
  'pending_review',
  'approved_candidate',
  'not_same_person',
  'rejected_bad_record',
  'rejected_not_relevant',
  'unsure',
  'suppressed',
  'same_person',
]);
export const sourcingReviewSignalSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_:-]{1,79}$/);

export const createSourceRunSchema = z.object({
  id: z.string().trim().min(1).optional(),
  runId: z.string().trim().min(1).optional(),
  sourceName: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  sourceDomain: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1).optional(),
  pipelineName: z.string().trim().min(1).default('default'),
  trigger: z.enum(['manual', 'scheduled', 'replay', 'api', 'local_worker']).default('api'),
  storagePath: z
    .string()
    .trim()
    .startsWith('sourcing/raw/')
    .optional(),
  metadata: rawObjectSchema,
  counts: rawObjectSchema.optional(),
  schemaVersion: z.string().trim().min(1).optional(),
  contentHash: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).optional(),
  startedAt: z.string().trim().min(1).optional(),
  completedAt: z.string().trim().min(1).nullable().optional(),
});

export const sourceRunRecordSchema = z.object({
  id: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  sourceDomain: z.string().trim().min(1),
  pipelineName: z.string().trim().min(1),
  trigger: z.enum(['manual', 'scheduled', 'replay', 'api', 'local_worker']),
  storagePath: z.string().trim().startsWith('sourcing/raw/').optional(),
  metadata: rawObjectSchema,
  status: z.enum(['running', 'completed', 'failed']),
  sourceRecordCount: z.number().int().min(0),
  evidenceCount: z.number().int().min(0),
  dedupCandidateCount: z.number().int().min(0),
  startedAt: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const sourceRecordUpsertSchema = z.object({
  id: z.string().trim().min(1).optional(),
  sourceRecordId: z.string().trim().min(1).optional(),
  runId: z.string().trim().min(1).optional(),
  domain: z.string().trim().min(1).optional(),
  source: z.string().trim().min(1).optional(),
  sourceNativeId: z.string().trim().min(1).optional(),
  sourceUrl: z.string().trim().url().optional(),
  entityType: sourcingEntityTypeSchema.default('person'),
  displayName: z.string().trim().min(1).optional(),
  institution: z.string().trim().min(1).optional(),
  rawSummary: rawObjectSchema,
  display: rawObjectSchema,
  raw: rawObjectSchema,
  storagePath: z
    .string()
    .trim()
    .startsWith('sourcing/raw/')
    .optional(),
  rawStoragePath: z
    .string()
    .trim()
    .startsWith('sourcing/raw/')
    .optional(),
  contentHash: z.string().trim().min(1).optional(),
  schemaVersion: z.string().trim().min(1).optional(),
  observedAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const batchUpsertSourceRecordsSchema = z.object({
  runId: z.string().trim().min(1),
  records: z.array(sourceRecordUpsertSchema).min(1).max(100),
});

export const sourceRecordSchema = sourceRecordUpsertSchema.extend({
  id: z.string().trim().min(1),
  sourceRunId: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  sourceDomain: z.string().trim().min(1),
  pipelineName: z.string().trim().min(1),
  nameInstitutionKey: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const evidenceRecordSchema = z.object({
  id: z.string().trim().min(1),
  sourceRunId: z.string().trim().min(1),
  sourceRecordId: z.string().trim().min(1),
  sourceName: z.string().trim().min(1),
  sourceDomain: z.string().trim().min(1),
  entityType: sourcingEntityTypeSchema,
  evidenceType: sourcingEvidenceTypeSchema,
  rawValue: z.string().trim().min(1),
  normalizedValue: z.string().trim().min(1),
  valueHash: z.string().trim().min(1),
  quality: sourcingEvidenceQualitySchema,
  extractedFrom: z.object({
    sourcePath: z.string().trim().min(1),
    sourceUrl: z.string().trim().url().nullable(),
  }),
  observedAt: z.string(),
  extractorVersion: z.string().trim().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const dedupCandidateSchema = z.object({
  id: z.string().trim().min(1),
  entityType: sourcingEntityTypeSchema,
  status: sourcingReviewStatusSchema,
  strength: sourcingDedupStrengthSchema,
  reasonCodes: z.array(z.string().trim().min(1)).min(1),
  sourceRecordIds: z.array(z.string().trim().min(1)).min(1),
  evidenceIds: z.array(z.string().trim().min(1)),
  valueHashes: z.array(z.string().trim().min(1)),
  displayName: z.string().nullable(),
  createdFromSourceRunId: z.string().trim().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createReviewLabelSchema = z.object({
  dedupCandidateId: z.string().trim().min(1),
  label: sourcingReviewLabelSchema.optional(),
  identityLabel: sourcingIdentityLabelSchema.nullable().optional(),
  candidateDecision: sourcingCandidateDecisionSchema.optional(),
  reviewerId: z.string().trim().min(1).default('manual-reviewer'),
  notes: z.string().trim().default(''),
  confirmedSignals: z.array(sourcingReviewSignalSchema).optional(),
});

export const reviewLabelRecordSchema = createReviewLabelSchema.extend({
  id: z.string().trim().min(1),
  identityLabel: sourcingIdentityLabelSchema.nullable(),
  candidateDecision: sourcingCandidateDecisionSchema,
  suggestedSignals: z.array(sourcingReviewSignalSchema),
  confirmedSignals: z.array(sourcingReviewSignalSchema),
  sourceRecordIds: z.array(z.string().trim().min(1)).min(1),
  evidenceIds: z.array(z.string().trim().min(1)),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const approvedEntitySchema = z.object({
  id: z.string().trim().min(1),
  entityType: sourcingEntityTypeSchema,
  status: z.enum(['approved']),
  sourceRecordIds: z.array(z.string().trim().min(1)).min(1),
  evidenceIds: z.array(z.string().trim().min(1)),
  approvedByReviewLabelId: z.string().trim().min(1),
  displayName: z.string().nullable(),
  emails: z.array(z.string()),
  homepages: z.array(z.string()),
  githubUrls: z.array(z.string()),
  orcids: z.array(z.string()),
  institutions: z.array(z.string()),
  suggestedSignals: z.array(sourcingReviewSignalSchema),
  confirmedSignals: z.array(sourcingReviewSignalSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SourcingEntityType = z.infer<typeof sourcingEntityTypeSchema>;
export type SourcingEvidenceType = z.infer<typeof sourcingEvidenceTypeSchema>;
export type SourcingEvidenceQuality = z.infer<typeof sourcingEvidenceQualitySchema>;
export type SourcingDedupStrength = z.infer<typeof sourcingDedupStrengthSchema>;
export type SourcingReviewLabel = z.infer<typeof sourcingReviewLabelSchema>;
export type SourcingIdentityLabel = z.infer<typeof sourcingIdentityLabelSchema>;
export type SourcingCandidateDecision = z.infer<typeof sourcingCandidateDecisionSchema>;
export type SourcingReviewStatus = z.infer<typeof sourcingReviewStatusSchema>;
export type CreateSourceRunInput = z.infer<typeof createSourceRunSchema>;
export type SourceRunRecord = z.infer<typeof sourceRunRecordSchema>;
export type SourceRecordUpsertInput = z.infer<typeof sourceRecordUpsertSchema>;
export type BatchUpsertSourceRecordsInput = z.infer<typeof batchUpsertSourceRecordsSchema>;
export type SourceRecord = z.infer<typeof sourceRecordSchema>;
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;
export type DedupCandidate = z.infer<typeof dedupCandidateSchema>;
export type CreateReviewLabelInput = z.infer<typeof createReviewLabelSchema>;
export type ReviewLabelRecord = z.infer<typeof reviewLabelRecordSchema>;
export type ApprovedEntity = z.infer<typeof approvedEntitySchema>;
