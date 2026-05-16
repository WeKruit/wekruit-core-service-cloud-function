import type {
  CareerStage,
  IndustrySector,
  RoleFunction,
} from '@wekruit/shared-tags/canonical';
import {
  CANONICAL_TAGS_SCHEMA_VERSION,
  canonicalTagsSchema,
  type CanonicalCareerStageEntry,
  type CanonicalIndustrySectorEntry,
  type CanonicalRelevantTagEntry,
  type CanonicalRoleFunctionEntry,
  type CanonicalSkillEntry,
  type CanonicalTags,
} from './canonicalTags';
import type {
  CandidateCareerStage,
  CandidateEnrichmentDraft,
  CandidateIndustryDomain,
  CandidateSpecialization,
  CandidateTrack,
} from './records';

type MappingSource = 'legacy_enrichment_mapping';

type LegacySignal = {
  field: string;
  value: string;
  confidence: number;
  evidenceIds: string[];
};

type TrackMapping = {
  roleFunctions?: RoleFunction[];
  industrySectors?: IndustrySector[];
  relevantTags?: string[];
  founderCareerStageFallback?: boolean;
};

type DomainMapping = {
  industrySectors?: IndustrySector[];
  relevantTags?: string[];
};

const mappingSource: MappingSource = 'legacy_enrichment_mapping';

const trackMappings: Partial<Record<CandidateTrack, TrackMapping>> = {
  software_engineering: {
    roleFunctions: ['software_engineering'],
  },
  data_science: {
    roleFunctions: ['data_analysis'],
    relevantTags: ['data_science'],
  },
  product_design: {
    roleFunctions: ['creatives_and_design'],
    relevantTags: ['product_design'],
  },
  product_management: {
    roleFunctions: ['product_management'],
  },
  marketing_growth: {
    roleFunctions: ['marketing'],
    relevantTags: ['growth_marketing'],
  },
  business_founder: {
    relevantTags: ['startup_founder'],
    founderCareerStageFallback: true,
  },
  hardware_mechanical: {
    roleFunctions: ['engineering_and_development'],
    industrySectors: ['hardware_and_semiconductors'],
  },
  academic_research: {
    industrySectors: ['research_and_academia'],
    relevantTags: ['academic_research'],
  },
  ai_research: {
    industrySectors: ['artificial_intelligence_and_machine_learning'],
    relevantTags: ['artificial_intelligence_research'],
  },
};

const industryDomainMappings: Partial<Record<CandidateIndustryDomain, DomainMapping>> = {
  artificial_intelligence: {
    industrySectors: ['artificial_intelligence_and_machine_learning'],
  },
  ai_infrastructure: {
    industrySectors: ['artificial_intelligence_and_machine_learning'],
    relevantTags: ['artificial_intelligence_infrastructure'],
  },
  developer_tools: {
    relevantTags: ['developer_tools'],
  },
  healthcare_ai: {
    industrySectors: [
      'healthcare_and_life_sciences',
      'artificial_intelligence_and_machine_learning',
    ],
    relevantTags: ['healthcare_artificial_intelligence'],
  },
  robotics: {
    industrySectors: ['robotics_and_automation'],
  },
  education_technology: {
    industrySectors: ['education_technology'],
  },
  climate_energy: {
    industrySectors: ['clean_energy_and_climate_tech'],
  },
  finance_fintech: {
    industrySectors: ['financial_technology'],
  },
  biotech_life_sciences: {
    industrySectors: [
      'biotechnology_and_pharmaceuticals',
      'healthcare_and_life_sciences',
    ],
  },
  enterprise_saas: {
    industrySectors: ['software_and_saas'],
    relevantTags: ['enterprise_software'],
  },
  cybersecurity: {
    industrySectors: ['cybersecurity'],
  },
  gaming_media: {
    industrySectors: [
      'gaming_and_esports',
      'media_and_entertainment',
    ],
  },
  accessibility_assistive_technology: {
    industrySectors: ['accessibility_and_assistive_technology'],
  },
  research_tools: {
    industrySectors: ['research_and_academia'],
    relevantTags: ['research_tools'],
  },
  open_source: {
    relevantTags: ['open_source'],
  },
};

const specializationRelevantTagMappings: Partial<Record<CandidateSpecialization, string[]>> = {
  frontend_engineering: ['frontend_engineering'],
  backend_engineering: ['backend_engineering'],
  full_stack_engineering: ['full_stack_engineering'],
  mobile_engineering: ['mobile_engineering'],
  machine_learning: ['machine_learning'],
  natural_language_processing: ['natural_language_processing'],
  computer_vision: ['computer_vision'],
  data_engineering: ['data_engineering'],
  data_analysis: ['data_analysis'],
  academic_publishing: ['academic_publishing'],
  developer_experience: ['developer_experience'],
  product_strategy: ['product_strategy'],
  growth_marketing: ['growth_marketing'],
  mechanical_design: ['mechanical_design'],
  embedded_systems: ['embedded_systems'],
  robotics: ['robotics'],
  ux_ui_design: ['user_experience_design'],
};

const careerStageMappings: Partial<Record<CandidateCareerStage, CareerStage>> = {
  student: 'student',
  early_career: 'entry_level',
  mid_career: 'mid_level',
  senior: 'senior',
  founder: 'founder',
};

const skillBucketByName: Record<string, CanonicalSkillEntry['bucket']> = {
  javascript: 'programming_languages',
  typescript: 'programming_languages',
  python: 'programming_languages',
  java: 'programming_languages',
  go: 'programming_languages',
  golang: 'programming_languages',
  rust: 'programming_languages',
  ruby: 'programming_languages',
  swift: 'programming_languages',
  kotlin: 'programming_languages',
  scala: 'programming_languages',
  php: 'programming_languages',
  'c++': 'programming_languages',
  'c#': 'programming_languages',
  html: 'programming_languages',
  css: 'programming_languages',
  sql: 'programming_languages',
  react: 'frameworks_and_libraries',
  'react-native': 'frameworks_and_libraries',
  'node.js': 'frameworks_and_libraries',
  express: 'frameworks_and_libraries',
  'next.js': 'frameworks_and_libraries',
  vue: 'frameworks_and_libraries',
  angular: 'frameworks_and_libraries',
  svelte: 'frameworks_and_libraries',
  django: 'frameworks_and_libraries',
  flask: 'frameworks_and_libraries',
  rails: 'frameworks_and_libraries',
  pytorch: 'data_and_ml',
  tensorflow: 'data_and_ml',
  pandas: 'data_and_ml',
  numpy: 'data_and_ml',
  scikit_learn: 'data_and_ml',
  machine_learning: 'data_and_ml',
  deep_learning: 'data_and_ml',
  natural_language_processing: 'data_and_ml',
  computer_vision: 'data_and_ml',
  postgresql: 'databases',
  postgres: 'databases',
  mysql: 'databases',
  sqlite: 'databases',
  mongodb: 'databases',
  redis: 'databases',
  firestore: 'databases',
  dynamodb: 'databases',
  aws: 'cloud_and_infrastructure',
  gcp: 'cloud_and_infrastructure',
  google_cloud: 'cloud_and_infrastructure',
  azure: 'cloud_and_infrastructure',
  firebase: 'cloud_and_infrastructure',
  docker: 'cloud_and_infrastructure',
  kubernetes: 'cloud_and_infrastructure',
  terraform: 'cloud_and_infrastructure',
  git: 'devops_and_tooling',
  github: 'devops_and_tooling',
  linux: 'devops_and_tooling',
  figma: 'design_and_ux',
  user_experience_design: 'design_and_ux',
  user_interface_design: 'design_and_ux',
  product_strategy: 'product_and_business',
  growth_marketing: 'product_and_business',
  marketing: 'product_and_business',
  leadership: 'soft_skills',
  communication: 'soft_skills',
  robotics: 'domain_specific',
};

function sortedUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function mergeCanonicalEntry<T extends {
  confidence: number;
  evidenceIds: string[];
  mappedFrom: string[];
}>(
  existing: T | undefined,
  next: T,
): T {
  if (!existing) {
    return {
      ...next,
      evidenceIds: sortedUnique(next.evidenceIds),
      mappedFrom: sortedUnique(next.mappedFrom),
    };
  }
  return {
    ...existing,
    confidence: Math.max(existing.confidence, next.confidence),
    evidenceIds: sortedUnique([...existing.evidenceIds, ...next.evidenceIds]),
    mappedFrom: sortedUnique([...existing.mappedFrom, ...next.mappedFrom]),
  };
}

function addUnmapped(
  target: Record<string, string[]>,
  field: string,
  value: string,
): void {
  target[field] = sortedUnique([...(target[field] ?? []), value]);
}

function normalizeSkillName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_+#.-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function signalForScoredTrack(track: CandidateEnrichmentDraft['scoredTracks'][number]): LegacySignal {
  return {
    field: 'scoredTracks',
    value: track.track,
    confidence: track.score,
    evidenceIds: track.evidenceIds,
  };
}

function relevantTagEntriesWithCap(
  entries: CanonicalRelevantTagEntry[],
  unmappedLegacyLabels: Record<string, string[]>,
): CanonicalRelevantTagEntry[] {
  if (entries.length <= 12) {
    return entries;
  }
  for (const entry of entries.slice(12)) {
    addUnmapped(unmappedLegacyLabels, 'relevantTagsOverflow', entry.value);
  }
  return entries.slice(0, 12);
}

export function mapEnrichmentDraftToCanonicalTags(draft: CandidateEnrichmentDraft): CanonicalTags {
  const roleFunctions = new Map<string, CanonicalRoleFunctionEntry>();
  const industrySectors = new Map<string, CanonicalIndustrySectorEntry>();
  const relevantTags = new Map<string, CanonicalRelevantTagEntry>();
  const skills = new Map<string, CanonicalSkillEntry>();
  const unmappedLegacyLabels: Record<string, string[]> = {};
  let careerStage: CanonicalCareerStageEntry | null = null;
  let founderFallback: LegacySignal | null = null;

  const addRoleFunction = (value: RoleFunction, signal: LegacySignal) => {
    roleFunctions.set(
      value,
      mergeCanonicalEntry(roleFunctions.get(value), {
        value,
        confidence: signal.confidence,
        evidenceIds: signal.evidenceIds,
        mappedFrom: [`${signal.field}:${signal.value}`],
        mappingSource,
      }),
    );
  };

  const addIndustrySector = (value: IndustrySector, signal: LegacySignal) => {
    industrySectors.set(
      value,
      mergeCanonicalEntry(industrySectors.get(value), {
        value,
        confidence: signal.confidence,
        evidenceIds: signal.evidenceIds,
        mappedFrom: [`${signal.field}:${signal.value}`],
        mappingSource,
      }),
    );
  };

  const addRelevantTag = (value: string, signal: LegacySignal) => {
    relevantTags.set(
      value,
      mergeCanonicalEntry(relevantTags.get(value), {
        value,
        confidence: signal.confidence,
        evidenceIds: signal.evidenceIds,
        mappedFrom: [`${signal.field}:${signal.value}`],
        mappingSource,
      }),
    );
  };

  const setCareerStage = (value: CareerStage, signal: LegacySignal) => {
    const next: CanonicalCareerStageEntry = {
      value,
      confidence: signal.confidence,
      evidenceIds: signal.evidenceIds,
      mappedFrom: [`${signal.field}:${signal.value}`],
      mappingSource,
    };
    careerStage = careerStage
      ? mergeCanonicalEntry(careerStage, next)
      : next;
  };

  for (const track of draft.scoredTracks) {
    if (track.track === 'unknown_other') {
      addUnmapped(unmappedLegacyLabels, 'scoredTracks', track.track);
      continue;
    }

    const mapping = trackMappings[track.track];
    const signal = signalForScoredTrack(track);
    if (!mapping) {
      addUnmapped(unmappedLegacyLabels, 'scoredTracks', track.track);
      continue;
    }
    for (const roleFunction of mapping.roleFunctions ?? []) {
      addRoleFunction(roleFunction, signal);
    }
    for (const industrySector of mapping.industrySectors ?? []) {
      addIndustrySector(industrySector, signal);
    }
    for (const relevantTag of mapping.relevantTags ?? []) {
      addRelevantTag(relevantTag, signal);
    }
    if (mapping.founderCareerStageFallback) {
      founderFallback = signal;
    }
  }

  for (const specialization of draft.specializations) {
    if (specialization.specialization === 'unknown_other') {
      addUnmapped(unmappedLegacyLabels, 'specializations', specialization.specialization);
      continue;
    }
    const tags = specializationRelevantTagMappings[specialization.specialization];
    if (!tags) {
      addUnmapped(unmappedLegacyLabels, 'specializations', specialization.specialization);
      continue;
    }
    const signal: LegacySignal = {
      field: 'specializations',
      value: specialization.specialization,
      confidence: specialization.confidence,
      evidenceIds: specialization.evidenceIds,
    };
    for (const tag of tags) {
      addRelevantTag(tag, signal);
    }
  }

  for (const interest of draft.industryDomainInterests) {
    if (interest.domain === 'unknown_other') {
      addUnmapped(unmappedLegacyLabels, 'industryDomainInterests', interest.domain);
      continue;
    }
    const mapping = industryDomainMappings[interest.domain];
    if (!mapping) {
      addUnmapped(unmappedLegacyLabels, 'industryDomainInterests', interest.domain);
      continue;
    }
    const signal: LegacySignal = {
      field: 'industryDomainInterests',
      value: interest.domain,
      confidence: interest.confidence,
      evidenceIds: interest.evidenceIds,
    };
    for (const industrySector of mapping.industrySectors ?? []) {
      addIndustrySector(industrySector, signal);
    }
    for (const relevantTag of mapping.relevantTags ?? []) {
      addRelevantTag(relevantTag, signal);
    }
  }

  if (draft.careerStage.value === 'academic_researcher') {
    addRelevantTag('academic_researcher', {
      field: 'careerStage',
      value: draft.careerStage.value,
      confidence: draft.careerStage.confidence,
      evidenceIds: draft.careerStage.evidenceIds,
    });
  } else if (draft.careerStage.value === 'unknown') {
    addUnmapped(unmappedLegacyLabels, 'careerStage', draft.careerStage.value);
  } else {
    const mappedCareerStage = careerStageMappings[draft.careerStage.value];
    if (mappedCareerStage) {
      setCareerStage(mappedCareerStage, {
        field: 'careerStage',
        value: draft.careerStage.value,
        confidence: draft.careerStage.confidence,
        evidenceIds: draft.careerStage.evidenceIds,
      });
    } else {
      addUnmapped(unmappedLegacyLabels, 'careerStage', draft.careerStage.value);
    }
  }

  if (!careerStage && founderFallback) {
    setCareerStage('founder', founderFallback);
  }

  for (const skill of draft.skills) {
    const name = normalizeSkillName(skill.skill);
    const bucket = skillBucketByName[name];
    if (!name || !bucket) {
      addUnmapped(unmappedLegacyLabels, 'skills', skill.skill);
      continue;
    }
    const key = `${name}:${bucket}`;
    skills.set(
      key,
      mergeCanonicalEntry(skills.get(key), {
        name,
        bucket,
        proficiency: 'intermediate',
        confidence: skill.confidence,
        evidenceIds: skill.evidenceIds,
        mappedFrom: [`skills:${skill.skill}`],
        mappingSource,
      }),
    );
  }

  return canonicalTagsSchema.parse({
    schemaVersion: CANONICAL_TAGS_SCHEMA_VERSION,
    roleFunctions: [...roleFunctions.values()],
    industrySectors: [...industrySectors.values()],
    careerStage,
    relevantTags: relevantTagEntriesWithCap([...relevantTags.values()], unmappedLegacyLabels),
    skills: [...skills.values()],
    unmappedLegacyLabels,
  });
}
