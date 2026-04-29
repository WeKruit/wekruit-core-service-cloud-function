import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import OpenAI from 'openai';

import type { EnrichmentEvidencePack } from '../application/enrichment';
import {
  candidateCareerStageValues,
  candidateContactabilityValues,
  candidateIndustryDomainValues,
  candidateSpecializationValues,
  candidateTrackValues,
  type CandidateEnrichmentDraft,
} from '../domain/records';

export interface SourcingEnrichmentInferencePort {
  inferCandidateProfile(input: {
    evidencePack: EnrichmentEvidencePack;
    deterministicFeatures: Record<string, unknown>;
  }): Promise<CandidateEnrichmentDraft>;
}

export interface OpenAISourcingEnrichmentConfig {
  apiKey: string;
  model: string;
}

function localEnvValue(name: string): string {
  let current = process.cwd();
  for (let depth = 0; depth < 8; depth += 1) {
    const path = join(current, '.env');
    if (existsSync(path)) {
      const lines = readFileSync(path, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
          continue;
        }
        const index = trimmed.indexOf('=');
        const key = trimmed.slice(0, index).trim();
        if (key !== name) {
          continue;
        }
        let value = trimmed.slice(index + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        return value.trim();
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return '';
}

export function getOpenAISourcingEnrichmentConfig(): OpenAISourcingEnrichmentConfig {
  const apiKey = (process.env.OPENAI_API_KEY ?? localEnvValue('OPENAI_API_KEY')).trim();
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY for sourcing enrichment.');
  }
  return {
    apiKey,
    model: (process.env.SOURCING_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? 'gpt-4o-mini').trim(),
  };
}

function evidenceIdArraySchema(evidenceIds: string[]) {
  return {
    type: 'array',
    items: evidenceIds.length > 0 ? { type: 'string', enum: evidenceIds } : { type: 'string' },
  };
}

function fieldEvidenceSchema(evidenceIds: string[]) {
  const evidenceIdsSchema = evidenceIdArraySchema(evidenceIds);
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      primaryTrack: evidenceIdsSchema,
      scoredTracks: evidenceIdsSchema,
      specializations: evidenceIdsSchema,
      skills: evidenceIdsSchema,
      industryDomainInterests: evidenceIdsSchema,
      careerStage: evidenceIdsSchema,
      contactability: evidenceIdsSchema,
      matchingSummary: evidenceIdsSchema,
    },
    required: [
      'primaryTrack',
      'scoredTracks',
      'specializations',
      'skills',
      'industryDomainInterests',
      'careerStage',
      'contactability',
      'matchingSummary',
    ],
  };
}

function enrichmentDraftJsonSchema(evidenceIds: string[]) {
  const evidenceIdsSchema = evidenceIdArraySchema(evidenceIds);
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      schemaVersion: { type: 'string', enum: ['candidate-enrichment-draft-v1'] },
      primaryTrack: { type: 'string', enum: candidateTrackValues },
      scoredTracks: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            track: { type: 'string', enum: candidateTrackValues },
            score: { type: 'number', minimum: 0, maximum: 1 },
            evidenceIds: evidenceIdsSchema,
          },
          required: ['track', 'score', 'evidenceIds'],
        },
      },
      specializations: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            specialization: { type: 'string', enum: candidateSpecializationValues },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            evidenceIds: evidenceIdsSchema,
          },
          required: ['specialization', 'confidence', 'evidenceIds'],
        },
      },
      skills: {
        type: 'array',
        maxItems: 20,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            skill: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            evidenceIds: evidenceIdsSchema,
          },
          required: ['skill', 'confidence', 'evidenceIds'],
        },
      },
      industryDomainInterests: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            domain: { type: 'string', enum: candidateIndustryDomainValues },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            evidenceIds: evidenceIdsSchema,
          },
          required: ['domain', 'confidence', 'evidenceIds'],
        },
      },
      careerStage: {
        type: 'object',
        additionalProperties: false,
        properties: {
          value: { type: 'string', enum: candidateCareerStageValues },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidenceIds: evidenceIdsSchema,
        },
        required: ['value', 'confidence', 'evidenceIds'],
      },
      contactability: {
        type: 'object',
        additionalProperties: false,
        properties: {
          value: { type: 'string', enum: candidateContactabilityValues },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidenceIds: evidenceIdsSchema,
        },
        required: ['value', 'confidence', 'evidenceIds'],
      },
      matchingSummary: { type: 'string' },
      fieldEvidence: fieldEvidenceSchema(evidenceIds),
      proposedTags: {
        type: 'array',
        maxItems: 12,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tag: { type: 'string' },
            reason: { type: 'string' },
            evidenceIds: evidenceIdsSchema,
          },
          required: ['tag', 'reason', 'evidenceIds'],
        },
      },
      warnings: {
        type: 'array',
        maxItems: 12,
        items: { type: 'string' },
      },
    },
    required: [
      'schemaVersion',
      'primaryTrack',
      'scoredTracks',
      'specializations',
      'skills',
      'industryDomainInterests',
      'careerStage',
      'contactability',
      'matchingSummary',
      'fieldEvidence',
      'proposedTags',
      'warnings',
    ],
  };
}

function outputTextFromResponse(response: unknown): string {
  const direct = (response as { output_text?: unknown }).output_text;
  if (typeof direct === 'string' && direct.trim()) {
    return direct;
  }

  const output = (response as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output;
  const text = output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (text) {
    return text;
  }

  throw new Error('OpenAI response did not include structured output text.');
}

export class OpenAISourcingEnrichmentClient implements SourcingEnrichmentInferencePort {
  private readonly client: OpenAI;

  constructor(private readonly config: OpenAISourcingEnrichmentConfig, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey: config.apiKey });
  }

  async inferCandidateProfile(input: {
    evidencePack: EnrichmentEvidencePack;
    deterministicFeatures: Record<string, unknown>;
  }): Promise<CandidateEnrichmentDraft> {
    const approvedEvidenceIds = input.evidencePack.evidence.map((entry) => entry.id);
    const response = await this.client.responses.create({
      model: this.config.model,
      input: [
        {
          role: 'system',
          content: [
            'You enrich approved sourcing candidates for later job/company matching.',
            'Use only the approved evidence pack and deterministic features.',
            'Choose controlled taxonomy values before proposing open-ended tags.',
            'Every non-unknown label must include evidenceIds from the evidence pack.',
            'Evidence IDs must be exact strings from the approved evidence list.',
            'If evidence is weak or absent, choose unknown_other or unknown and add a warning.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            taxonomy: {
              tracks: candidateTrackValues,
              specializations: candidateSpecializationValues,
              industryDomainInterests: candidateIndustryDomainValues,
              careerStages: candidateCareerStageValues,
              contactability: candidateContactabilityValues,
            },
            deterministicFeatures: input.deterministicFeatures,
            evidencePack: input.evidencePack,
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'candidate_enrichment_draft',
          strict: true,
          schema: enrichmentDraftJsonSchema(approvedEvidenceIds),
        },
      },
      max_output_tokens: 2400,
    });

    return JSON.parse(outputTextFromResponse(response)) as CandidateEnrichmentDraft;
  }
}
