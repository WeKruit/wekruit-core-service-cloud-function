import {
  CAREER_STAGE_VOCAB,
  INDUSTRY_SECTOR_VOCAB,
  KNOWN_ABBREVIATIONS,
  RELEVANT_TAGS_MAX,
  ROLE_FUNCTION_VOCAB,
  SKILL_BUCKET_VOCAB,
  SKILL_NAME_PATTERN,
  SKILL_PROFICIENCY_VOCAB,
  validateRelevantTag,
  type CareerStage,
  type IndustrySector,
  type RoleFunction,
  type SkillBucket,
  type SkillProficiency,
} from '@wekruit/shared-tags/canonical';
import { z } from 'zod';

export const CANONICAL_TAGS_SCHEMA_VERSION = 'shared-tags-v1';

export const canonicalRoleFunctionValues = ROLE_FUNCTION_VOCAB;
export const canonicalIndustrySectorValues = INDUSTRY_SECTOR_VOCAB;
export const canonicalCareerStageValues = CAREER_STAGE_VOCAB;
export const canonicalSkillBucketValues = SKILL_BUCKET_VOCAB;
export const canonicalSkillProficiencyValues = SKILL_PROFICIENCY_VOCAB;
export const canonicalRelevantTagsMax = RELEVANT_TAGS_MAX;

const confidenceSchema = z.number().min(0).max(1);
const evidenceIdListSchema = z.array(z.string().trim().min(1)).default([]);
const mappedFromListSchema = z.array(z.string().trim().min(1)).default([]);

export const canonicalTagMappingSourceSchema = z.enum([
  'legacy_enrichment_mapping',
  'manual_reviewer',
]);

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {
  return values.includes(value as T);
}

function canonicalValueSchema<T extends string>(
  values: readonly T[],
  fieldName: string,
): z.ZodType<T> {
  return z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (!isOneOf(value, values)) {
        context.addIssue({
          code: 'custom',
          message: `${fieldName} must be a shared-tags canonical value.`,
        });
      }
    })
    .transform((value) => value as T);
}

const roleFunctionValueSchema = canonicalValueSchema<RoleFunction>(
  ROLE_FUNCTION_VOCAB,
  'roleFunction',
);
const industrySectorValueSchema = canonicalValueSchema<IndustrySector>(
  INDUSTRY_SECTOR_VOCAB,
  'industrySector',
);
const careerStageValueSchema = canonicalValueSchema<CareerStage>(
  CAREER_STAGE_VOCAB,
  'careerStage',
);
const skillBucketValueSchema = canonicalValueSchema<SkillBucket>(
  SKILL_BUCKET_VOCAB,
  'skillBucket',
);
const skillProficiencyValueSchema = canonicalValueSchema<SkillProficiency>(
  SKILL_PROFICIENCY_VOCAB,
  'skillProficiency',
);

const relevantTagValueSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    const result = validateRelevantTag(value);
    if (!result.ok) {
      context.addIssue({
        code: 'custom',
        message: result.reason ?? 'relevantTag must be a shared-tags valid token.',
      });
    }
  });

const skillNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((value, context) => {
    if (!SKILL_NAME_PATTERN.test(value)) {
      context.addIssue({
        code: 'custom',
        message: 'skill.name must match the shared-tags skill token format.',
      });
    }
    if (KNOWN_ABBREVIATIONS.has(value)) {
      context.addIssue({
        code: 'custom',
        message: 'skill.name must use the spelled-out shared-tags form, not an abbreviation.',
      });
    }
  });

function canonicalEntrySchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    confidence: confidenceSchema,
    evidenceIds: evidenceIdListSchema,
    mappedFrom: mappedFromListSchema,
    mappingSource: canonicalTagMappingSourceSchema,
  });
}

export const canonicalRoleFunctionEntrySchema = canonicalEntrySchema(roleFunctionValueSchema);
export const canonicalIndustrySectorEntrySchema = canonicalEntrySchema(industrySectorValueSchema);
export const canonicalCareerStageEntrySchema = canonicalEntrySchema(careerStageValueSchema);
export const canonicalRelevantTagEntrySchema = canonicalEntrySchema(relevantTagValueSchema);

export const canonicalSkillEntrySchema = z.object({
  name: skillNameSchema,
  bucket: skillBucketValueSchema,
  proficiency: skillProficiencyValueSchema,
  confidence: confidenceSchema,
  evidenceIds: evidenceIdListSchema,
  mappedFrom: mappedFromListSchema,
  mappingSource: canonicalTagMappingSourceSchema,
});

export const canonicalTagsSchema = z.object({
  schemaVersion: z.literal(CANONICAL_TAGS_SCHEMA_VERSION),
  roleFunctions: z.array(canonicalRoleFunctionEntrySchema).max(ROLE_FUNCTION_VOCAB.length).default([]),
  industrySectors: z.array(canonicalIndustrySectorEntrySchema).max(INDUSTRY_SECTOR_VOCAB.length).default([]),
  careerStage: canonicalCareerStageEntrySchema.nullable().default(null),
  relevantTags: z.array(canonicalRelevantTagEntrySchema).max(RELEVANT_TAGS_MAX).default([]),
  skills: z.array(canonicalSkillEntrySchema).max(50).default([]),
  unmappedLegacyLabels: z.record(z.string(), z.array(z.string().trim().min(1))).default({}),
});

export type CanonicalTags = z.infer<typeof canonicalTagsSchema>;
export type CanonicalTagMappingSource = z.infer<typeof canonicalTagMappingSourceSchema>;
export type CanonicalRoleFunctionEntry = z.infer<typeof canonicalRoleFunctionEntrySchema>;
export type CanonicalIndustrySectorEntry = z.infer<typeof canonicalIndustrySectorEntrySchema>;
export type CanonicalCareerStageEntry = z.infer<typeof canonicalCareerStageEntrySchema>;
export type CanonicalRelevantTagEntry = z.infer<typeof canonicalRelevantTagEntrySchema>;
export type CanonicalSkillEntry = z.infer<typeof canonicalSkillEntrySchema>;

export function createEmptyCanonicalTags(): CanonicalTags {
  return canonicalTagsSchema.parse({
    schemaVersion: CANONICAL_TAGS_SCHEMA_VERSION,
  });
}
