import {
  canonicalCareerStageValues,
  canonicalIndustrySectorValues,
  canonicalRelevantTagsMax,
  canonicalRoleFunctionValues,
  canonicalSkillBucketValues,
  canonicalSkillProficiencyValues,
} from './canonicalTags';
import {
  candidateCareerStageValues,
  candidateContactabilityValues,
  candidateIndustryDomainValues,
  candidateSpecializationValues,
  candidateTrackValues,
} from './records';

export const SOURCING_TAXONOMY_SCHEMA_VERSION = 'sourcing-taxonomy-v1';

export type SourcingTaxonomy = ReturnType<typeof getSourcingTaxonomy>;

export function getSourcingTaxonomy() {
  return {
    schemaVersion: SOURCING_TAXONOMY_SCHEMA_VERSION,
    legacy: {
      tracks: [...candidateTrackValues],
      specializations: [...candidateSpecializationValues],
      industryDomains: [...candidateIndustryDomainValues],
      careerStages: [...candidateCareerStageValues],
      contactability: [...candidateContactabilityValues],
    },
    canonical: {
      roleFunctions: [...canonicalRoleFunctionValues],
      industrySectors: [...canonicalIndustrySectorValues],
      careerStages: [...canonicalCareerStageValues],
      relevantTags: {
        max: canonicalRelevantTagsMax,
        pattern: '^[a-z][a-z0-9_]{1,79}$',
      },
      skillBuckets: [...canonicalSkillBucketValues],
      skillProficiencies: [...canonicalSkillProficiencyValues],
    },
  };
}
