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
  'linkedin',
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
export const globalCandidateStatusSchema = z.enum(['active', 'held', 'merged', 'archived', 'approved']);
export const candidateEnrichmentStatusSchema = z.enum([
  'not_started',
  'needs_enrichment',
  'in_review',
  'enriched',
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
  status: globalCandidateStatusSchema.default('active'),
  schemaVersion: z.string().trim().min(1).default('global-candidate-v1'),
  sourceRecordIds: z.array(z.string().trim().min(1)).min(1),
  evidenceIds: z.array(z.string().trim().min(1)),
  sourceNames: z.array(z.string().trim().min(1)).default([]),
  sourceDomains: z.array(z.string().trim().min(1)).default([]),
  reviewLabelIds: z.array(z.string().trim().min(1)).default([]),
  identityEvidenceHashes: z.array(z.string().trim().min(1)).default([]),
  approvedByReviewLabelId: z.string().trim().min(1),
  displayName: z.string().nullable(),
  emails: z.array(z.string()),
  homepages: z.array(z.string()),
  githubUrls: z.array(z.string()),
  orcids: z.array(z.string()),
  institutions: z.array(z.string()),
  suggestedSignals: z.array(sourcingReviewSignalSchema),
  confirmedSignals: z.array(sourcingReviewSignalSchema),
  needsEnrichment: z.boolean().default(true),
  enrichmentStatus: candidateEnrichmentStatusSchema.default('not_started'),
  mergedIntoCandidateId: z.string().trim().min(1).nullable().default(null),
  mergedByReviewId: z.string().trim().min(1).nullable().default(null),
  mergedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const candidateTrackValues = [
  'software_engineering',
  'ai_research',
  'data_science',
  'product_design',
  'product_management',
  'marketing_growth',
  'business_founder',
  'hardware_mechanical',
  'academic_research',
  'unknown_other',
] as const;

export const candidateSpecializationValues = [
  'frontend_engineering',
  'backend_engineering',
  'full_stack_engineering',
  'mobile_engineering',
  'machine_learning',
  'natural_language_processing',
  'computer_vision',
  'data_engineering',
  'data_analysis',
  'academic_publishing',
  'developer_experience',
  'product_strategy',
  'growth_marketing',
  'mechanical_design',
  'embedded_systems',
  'robotics',
  'ux_ui_design',
  'unknown_other',
] as const;

export const candidateIndustryDomainValues = [
  'artificial_intelligence',
  'ai_infrastructure',
  'developer_tools',
  'healthcare_ai',
  'robotics',
  'education_technology',
  'climate_energy',
  'finance_fintech',
  'biotech_life_sciences',
  'enterprise_saas',
  'cybersecurity',
  'gaming_media',
  'accessibility_assistive_technology',
  'research_tools',
  'open_source',
  'unknown_other',
] as const;

export const candidateCareerStageValues = [
  'student',
  'early_career',
  'mid_career',
  'senior',
  'founder',
  'academic_researcher',
  'unknown',
] as const;

export const candidateContactabilityValues = ['high', 'medium', 'low', 'unknown'] as const;

export const candidateTrackSchema = z.enum(candidateTrackValues);
export const candidateSpecializationSchema = z.enum(candidateSpecializationValues);
export const candidateIndustryDomainSchema = z.enum(candidateIndustryDomainValues);
export const candidateCareerStageSchema = z.enum(candidateCareerStageValues);
export const candidateContactabilitySchema = z.enum(candidateContactabilityValues);
export const candidateEnrichmentReviewStatusSchema = z.enum([
  'pending_review',
  'approved',
  'held',
  'rejected',
]);
export const candidateEnrichmentRunStatusSchema = z.enum(['completed', 'failed']);
export const vendorProfileProviderSchema = z.enum(['brightdata', 'fake']);
export const vendorProfileLookupTypeSchema = z.enum(['linkedin_profile_by_url']);
export const vendorEnrichmentRunStatusSchema = z.enum([
  'running',
  'completed',
  'no_match',
  'failed',
  'async_snapshot_pending',
]);
export const vendorProfileMatchReviewStatusSchema = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'ignored',
]);

const enrichmentConfidenceSchema = z.number().min(0).max(1);
const evidenceIdListSchema = z.array(z.string().trim().min(1)).default([]);
const nullableBoundedVendorTextSchema = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).nullable().default(null);
const boundedVendorTextListSchema = (maxItems: number, maxLength: number) =>
  z.array(z.string().trim().min(1).max(maxLength)).max(maxItems).default([]);
const normalizedSkillSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) =>
    value
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9+#./ -]/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .refine((value) => /^[a-z0-9][a-z0-9+#./ -]{1,63}$/.test(value), {
    message: 'Skill must normalize to a readable 2-64 character label.',
  });
const normalizedEnrichmentTagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) =>
    value
      .replace(/[\s-]+/g, '_')
      .replace(/[^a-z0-9_:-]/g, '')
      .trim(),
  )
  .refine((value) => /^[a-z][a-z0-9_:-]{1,79}$/.test(value), {
    message: 'Tag must normalize to a stable review signal token.',
  });

export const enrichmentScoredTrackSchema = z.object({
  track: candidateTrackSchema,
  score: enrichmentConfidenceSchema,
  evidenceIds: evidenceIdListSchema,
});

export const enrichmentSpecializationSchema = z.object({
  specialization: candidateSpecializationSchema,
  confidence: enrichmentConfidenceSchema,
  evidenceIds: evidenceIdListSchema,
});

export const enrichmentSkillSchema = z.object({
  skill: normalizedSkillSchema,
  confidence: enrichmentConfidenceSchema,
  evidenceIds: evidenceIdListSchema,
});

export const enrichmentIndustryDomainSchema = z.object({
  domain: candidateIndustryDomainSchema,
  confidence: enrichmentConfidenceSchema,
  evidenceIds: evidenceIdListSchema,
});

export const enrichmentCareerStageSchema = z.object({
  value: candidateCareerStageSchema,
  confidence: enrichmentConfidenceSchema,
  evidenceIds: evidenceIdListSchema,
});

export const enrichmentContactabilitySchema = z.object({
  value: candidateContactabilitySchema,
  confidence: enrichmentConfidenceSchema,
  evidenceIds: evidenceIdListSchema,
});

export const enrichmentProposedTagSchema = z.object({
  tag: normalizedEnrichmentTagSchema,
  reason: z.string().trim().min(1).max(280),
  evidenceIds: evidenceIdListSchema,
});

export const candidateEnrichmentDraftSchema = z.object({
  schemaVersion: z.literal('candidate-enrichment-draft-v1'),
  primaryTrack: candidateTrackSchema,
  scoredTracks: z.array(enrichmentScoredTrackSchema).min(1).max(6),
  specializations: z.array(enrichmentSpecializationSchema).max(10),
  skills: z.array(enrichmentSkillSchema).max(20),
  industryDomainInterests: z.array(enrichmentIndustryDomainSchema).max(10),
  careerStage: enrichmentCareerStageSchema,
  contactability: enrichmentContactabilitySchema,
  matchingSummary: z.string().trim().min(1).max(900),
  fieldEvidence: z.record(z.string(), evidenceIdListSchema).default({}),
  proposedTags: z.array(enrichmentProposedTagSchema).max(12).default([]),
  warnings: z.array(z.string().trim().min(1).max(280)).max(12).default([]),
});

export const candidateEnrichmentRunSchema = z.object({
  id: z.string().trim().min(1),
  approvedEntityId: z.string().trim().min(1),
  status: candidateEnrichmentRunStatusSchema,
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  evidencePackHash: z.string().trim().min(1),
  evidencePack: rawObjectSchema,
  deterministicFeatures: rawObjectSchema,
  draft: candidateEnrichmentDraftSchema.nullable(),
  validationWarnings: z.array(z.string().trim().min(1)).default([]),
  error: z.string().trim().min(1).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const normalizedProfessionalProfileSummarySchema = z.object({
  profileUrl: z.string().trim().url(),
  name: nullableBoundedVendorTextSchema(160),
  headline: nullableBoundedVendorTextSchema(280),
  currentCompany: nullableBoundedVendorTextSchema(260),
  location: nullableBoundedVendorTextSchema(160),
  educationSummary: boundedVendorTextListSchema(10, 420),
  experienceSummary: boundedVendorTextListSchema(10, 900),
  skills: boundedVendorTextListSchema(40, 100),
  aboutSummary: nullableBoundedVendorTextSchema(2500),
  projectsPublications: boundedVendorTextListSchema(12, 800),
});

export const vendorEnrichmentRunSchema = z.object({
  id: z.string().trim().min(1),
  approvedEntityId: z.string().trim().min(1),
  provider: vendorProfileProviderSchema,
  lookupType: vendorProfileLookupTypeSchema,
  inputUrlHash: z.string().trim().min(1),
  selectedLinkedInUrl: z.string().trim().url(),
  selectedLinkedInUrlLineage: rawObjectSchema,
  datasetId: z.string().trim().min(1),
  status: vendorEnrichmentRunStatusSchema,
  snapshotId: z.string().trim().min(1).nullable().default(null),
  matchIds: z.array(z.string().trim().min(1)).default([]),
  error: z.string().trim().min(1).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const vendorProfileMatchSchema = z.object({
  id: z.string().trim().min(1),
  approvedEntityId: z.string().trim().min(1),
  vendorRunId: z.string().trim().min(1),
  provider: vendorProfileProviderSchema,
  lookupType: vendorProfileLookupTypeSchema,
  inputUrlHash: z.string().trim().min(1),
  selectedLinkedInUrl: z.string().trim().url(),
  selectedLinkedInUrlLineage: rawObjectSchema,
  providerRecordId: z.string().trim().min(1).nullable().default(null),
  providerProfileUrl: z.string().trim().url().nullable().default(null),
  normalizedProfile: normalizedProfessionalProfileSummarySchema,
  reviewStatus: vendorProfileMatchReviewStatusSchema,
  reviewerId: z.string().trim().min(1).nullable().default(null),
  reviewNote: z.string().trim().default(''),
  reviewedAt: z.string().nullable().default(null),
  approvedEvidenceId: z.string().trim().min(1).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const candidateEnrichmentReviewItemSchema = z.object({
  id: z.string().trim().min(1),
  approvedEntityId: z.string().trim().min(1),
  enrichmentRunId: z.string().trim().min(1),
  status: candidateEnrichmentReviewStatusSchema,
  evidencePackHash: z.string().trim().min(1),
  sourceRecordIds: z.array(z.string().trim().min(1)),
  evidenceIds: z.array(z.string().trim().min(1)),
  reviewLabelIds: z.array(z.string().trim().min(1)),
  displayName: z.string().nullable(),
  draft: candidateEnrichmentDraftSchema,
  validationWarnings: z.array(z.string().trim().min(1)).default([]),
  reviewerId: z.string().trim().min(1).nullable().default(null),
  reviewNote: z.string().trim().default(''),
  reviewedDraft: candidateEnrichmentDraftSchema.nullable().default(null),
  reviewedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const candidateProfileSchema = z.object({
  id: z.string().trim().min(1),
  approvedEntityId: z.string().trim().min(1),
  enrichmentRunId: z.string().trim().min(1),
  enrichmentReviewItemId: z.string().trim().min(1),
  schemaVersion: z.literal('candidate-profile-v1'),
  profileVersion: z.number().int().min(1),
  status: z.enum(['active', 'archived']).default('active'),
  displayName: z.string().nullable(),
  sourceNames: z.array(z.string().trim().min(1)),
  sourceDomains: z.array(z.string().trim().min(1)),
  sourceRecordIds: z.array(z.string().trim().min(1)),
  evidenceIds: z.array(z.string().trim().min(1)),
  reviewLabelIds: z.array(z.string().trim().min(1)),
  primaryTrack: candidateTrackSchema,
  scoredTracks: z.array(enrichmentScoredTrackSchema),
  specializations: z.array(enrichmentSpecializationSchema),
  skills: z.array(enrichmentSkillSchema),
  industryDomainInterests: z.array(enrichmentIndustryDomainSchema),
  careerStage: enrichmentCareerStageSchema,
  contactability: enrichmentContactabilitySchema,
  matchingSummary: z.string().trim().min(1).max(900),
  fieldEvidence: z.record(z.string(), evidenceIdListSchema),
  proposedTags: z.array(enrichmentProposedTagSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createEnrichmentReviewDecisionSchema = z.object({
  action: z.enum(['approve', 'hold', 'reject']),
  reviewerId: z.string().trim().min(1).default('manual-reviewer'),
  notes: z.string().trim().default(''),
  reviewedDraft: candidateEnrichmentDraftSchema.optional(),
});

export const createVendorProfileMatchDecisionSchema = z.object({
  action: z.enum(['approve', 'reject', 'ignore']),
  reviewerId: z.string().trim().min(1).default('manual-reviewer'),
  notes: z.string().trim().default(''),
});

export type SourcingEntityType = z.infer<typeof sourcingEntityTypeSchema>;
export type SourcingEvidenceType = z.infer<typeof sourcingEvidenceTypeSchema>;
export type SourcingEvidenceQuality = z.infer<typeof sourcingEvidenceQualitySchema>;
export type SourcingDedupStrength = z.infer<typeof sourcingDedupStrengthSchema>;
export type SourcingReviewLabel = z.infer<typeof sourcingReviewLabelSchema>;
export type SourcingIdentityLabel = z.infer<typeof sourcingIdentityLabelSchema>;
export type SourcingCandidateDecision = z.infer<typeof sourcingCandidateDecisionSchema>;
export type SourcingReviewStatus = z.infer<typeof sourcingReviewStatusSchema>;
export type GlobalCandidateStatus = z.infer<typeof globalCandidateStatusSchema>;
export type CandidateEnrichmentStatus = z.infer<typeof candidateEnrichmentStatusSchema>;
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
export type CandidateTrack = z.infer<typeof candidateTrackSchema>;
export type CandidateSpecialization = z.infer<typeof candidateSpecializationSchema>;
export type CandidateIndustryDomain = z.infer<typeof candidateIndustryDomainSchema>;
export type CandidateCareerStage = z.infer<typeof candidateCareerStageSchema>;
export type CandidateContactability = z.infer<typeof candidateContactabilitySchema>;
export type CandidateEnrichmentReviewStatus = z.infer<typeof candidateEnrichmentReviewStatusSchema>;
export type CandidateEnrichmentRunStatus = z.infer<typeof candidateEnrichmentRunStatusSchema>;
export type VendorProfileProvider = z.infer<typeof vendorProfileProviderSchema>;
export type VendorProfileLookupType = z.infer<typeof vendorProfileLookupTypeSchema>;
export type VendorEnrichmentRunStatus = z.infer<typeof vendorEnrichmentRunStatusSchema>;
export type VendorProfileMatchReviewStatus = z.infer<typeof vendorProfileMatchReviewStatusSchema>;
export type CandidateEnrichmentDraft = z.infer<typeof candidateEnrichmentDraftSchema>;
export type CandidateEnrichmentRun = z.infer<typeof candidateEnrichmentRunSchema>;
export type NormalizedProfessionalProfileSummary = z.infer<typeof normalizedProfessionalProfileSummarySchema>;
export type VendorEnrichmentRun = z.infer<typeof vendorEnrichmentRunSchema>;
export type VendorProfileMatch = z.infer<typeof vendorProfileMatchSchema>;
export type CandidateEnrichmentReviewItem = z.infer<typeof candidateEnrichmentReviewItemSchema>;
export type CandidateProfile = z.infer<typeof candidateProfileSchema>;
export type CreateEnrichmentReviewDecisionInput = z.infer<typeof createEnrichmentReviewDecisionSchema>;
export type CreateVendorProfileMatchDecisionInput = z.infer<typeof createVendorProfileMatchDecisionSchema>;
