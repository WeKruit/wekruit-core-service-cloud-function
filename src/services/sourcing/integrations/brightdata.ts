import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  normalizeLinkedInProfileUrl,
} from '../application/linkedin';
import {
  normalizedProfessionalProfileSummarySchema,
  type NormalizedProfessionalProfileSummary,
  type VendorProfileLookupType,
  type VendorProfileProvider,
} from '../domain/records';

export const brightDataLinkedInProfilesDatasetId = 'gd_l1viktl72bvl7bjuj0';

const defaultBrightDataBaseUrl = 'https://api.brightdata.com';
const lookupType: VendorProfileLookupType = 'linkedin_profile_by_url';

export type ProfessionalProfileLookupStatus = 'completed' | 'no_match' | 'async_snapshot_pending';

export type ProfessionalProfileLookupInput = {
  linkedinUrl: string;
};

export type ProfessionalProfileSnapshotRefreshInput = {
  linkedinUrl: string;
  snapshotId: string;
};

export type ProfessionalProfileLookupMatch = {
  provider: VendorProfileProvider;
  providerRecordId: string | null;
  providerProfileUrl: string | null;
  normalizedProfile: NormalizedProfessionalProfileSummary;
};

export type ProfessionalProfileLookupResult = {
  provider: VendorProfileProvider;
  lookupType: VendorProfileLookupType;
  datasetId: string;
  inputUrl: string;
  status: ProfessionalProfileLookupStatus;
  snapshotId: string | null;
  matches: ProfessionalProfileLookupMatch[];
};

export interface ProfessionalProfileLookupPort {
  lookupLinkedInProfile(input: ProfessionalProfileLookupInput): Promise<ProfessionalProfileLookupResult>;
  refreshLinkedInProfileSnapshot?(input: ProfessionalProfileSnapshotRefreshInput): Promise<ProfessionalProfileLookupResult>;
}

export type BrightDataLinkedInProviderConfig = {
  apiKey: string;
  baseUrl?: string;
  datasetId?: string;
  fetchImpl?: FetchLike;
};

type FetchRequestInit = {
  method: string;
  headers: Record<string, string>;
  body?: string;
};

type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText?: string;
  text(): Promise<string>;
};

type FetchLike = (url: string, init: FetchRequestInit) => Promise<FetchResponseLike>;

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

export function getBrightDataLinkedInProviderConfig(): BrightDataLinkedInProviderConfig {
  const apiKey = (process.env.BRIGHTDATA_API_KEY ?? localEnvValue('BRIGHTDATA_API_KEY')).trim();
  if (!apiKey) {
    throw new Error('Missing BRIGHTDATA_API_KEY for Bright Data LinkedIn profile lookup.');
  }
  return {
    apiKey,
    datasetId: brightDataLinkedInProfilesDatasetId,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value: string, maxLength: number): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

function stringFromUnknown(value: unknown, maxLength: number): string | null {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return cleanText(String(value), maxLength);
  }
  return null;
}

function firstString(record: Record<string, unknown>, keys: string[], maxLength: number): string | null {
  for (const key of keys) {
    const direct = stringFromUnknown(record[key], maxLength);
    if (direct) {
      return direct;
    }
  }
  return null;
}

function compactList(values: Array<string | null>, maxItems: number): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .slice(0, maxItems);
}

function summarizeCompany(value: unknown): string | null {
  if (isPlainRecord(value)) {
    return firstString(value, ['name', 'company_name', 'title'], 160);
  }
  return stringFromUnknown(value, 160);
}

function summarizeLocation(record: Record<string, unknown>): string | null {
  const explicit = firstString(record, ['location', 'profile_location', 'address'], 160);
  if (explicit) {
    return explicit;
  }
  return cleanText(
    [
      firstString(record, ['city'], 80),
      firstString(record, ['state'], 80),
      firstString(record, ['country', 'country_code'], 80),
    ].filter(Boolean).join(', '),
    160,
  );
}

function summarizeExperienceItem(value: unknown): string | null {
  if (!isPlainRecord(value)) {
    return stringFromUnknown(value, 280);
  }
  const title = firstString(value, ['title', 'position', 'role'], 120);
  const company = summarizeCompany(value.company ?? value.company_name ?? value.current_company);
  const dateRange = cleanText(
    [
      firstString(value, ['start_date', 'startDate'], 80),
      firstString(value, ['end_date', 'endDate'], 80),
    ].filter(Boolean).join(' - '),
    120,
  );
  const core = title && company ? `${title} at ${company}` : title ?? company;
  return cleanText([core, dateRange].filter(Boolean).join(' | '), 280);
}

function summarizeEducationItem(value: unknown): string | null {
  if (!isPlainRecord(value)) {
    return stringFromUnknown(value, 240);
  }
  const school = firstString(value, ['school', 'school_name', 'title', 'name'], 120);
  const degree = firstString(value, ['degree', 'degree_name', 'field'], 120);
  return cleanText([school, degree].filter(Boolean).join(' | '), 240);
}

function summarizeProjectItem(value: unknown): string | null {
  if (!isPlainRecord(value)) {
    return stringFromUnknown(value, 240);
  }
  return firstString(value, ['title', 'name', 'publication_title', 'description'], 240);
}

function summarizeSkillItem(value: unknown): string | null {
  if (isPlainRecord(value)) {
    return firstString(value, ['name', 'skill', 'title'], 80);
  }
  return stringFromUnknown(value, 80);
}

function listFromUnknown(
  value: unknown,
  summarizer: (entry: unknown) => string | null,
  maxItems: number,
): string[] {
  if (Array.isArray(value)) {
    return compactList(value.map((entry) => summarizer(entry)), maxItems);
  }
  const single = summarizer(value);
  return single ? [single] : [];
}

function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  return JSON.parse(trimmed);
}

function snapshotIdFromPayload(payload: unknown): string | null {
  if (!isPlainRecord(payload)) {
    return null;
  }
  return stringFromUnknown(payload.snapshot_id ?? payload.snapshotId, 120);
}

function recordsFromPayload(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter(isPlainRecord);
  }
  if (!isPlainRecord(payload)) {
    return [];
  }
  for (const key of ['data', 'results', 'items']) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isPlainRecord);
    }
  }
  return [];
}

function snapshotStatusFromPayload(payload: unknown): string | null {
  if (!isPlainRecord(payload)) {
    return null;
  }
  return stringFromUnknown(payload.status, 80)?.toLowerCase() ?? null;
}

export function normalizeBrightDataLinkedInProfile(
  payload: unknown,
  fallbackProfileUrl: string,
): NormalizedProfessionalProfileSummary {
  const record = isPlainRecord(payload) ? payload : {};
  const profileUrl =
    normalizeLinkedInProfileUrl(
      firstString(record, ['url', 'input_url', 'profile_url', 'linkedin_url'], 300) ?? fallbackProfileUrl,
    ) ?? normalizeLinkedInProfileUrl(fallbackProfileUrl);

  if (!profileUrl) {
    throw new Error('Bright Data LinkedIn profile payload did not include a valid profile URL.');
  }

  const name = firstString(record, ['name', 'full_name'], 160) ??
    cleanText(
      [
        firstString(record, ['first_name', 'firstname'], 80),
        firstString(record, ['last_name', 'lastname'], 80),
      ].filter(Boolean).join(' '),
      160,
    );
  const currentCompany = summarizeCompany(record.current_company ?? record.company ?? record.company_name);

  return normalizedProfessionalProfileSummarySchema.parse({
    profileUrl,
    name,
    headline: firstString(record, ['headline', 'position', 'title'], 240),
    currentCompany,
    location: summarizeLocation(record),
    educationSummary: listFromUnknown(record.education, summarizeEducationItem, 8),
    experienceSummary: listFromUnknown(record.experience, summarizeExperienceItem, 8),
    skills: listFromUnknown(record.skills, summarizeSkillItem, 20),
    aboutSummary: firstString(record, ['about', 'summary', 'description'], 900),
    projectsPublications: compactList(
      [
        ...listFromUnknown(record.projects, summarizeProjectItem, 8),
        ...listFromUnknown(record.publications, summarizeProjectItem, 8),
      ],
      8,
    ),
  });
}

const defaultFakeLinkedInProfileFixtures: Record<string, Record<string, unknown>> = {
  'https://www.linkedin.com/in/spencerwang1': {
    url: 'https://www.linkedin.com/in/spencerwang1',
    name: 'Spencer Wang',
    position: 'Synthetic product and engineering candidate fixture',
    current_company: {
      name: 'WeKruit Test Fixture',
    },
    city: 'San Francisco Bay Area',
    country_code: 'US',
    about: 'Synthetic local fixture for validating the Bright Data enrichment workflow.',
    experience: [
      {
        title: 'Builder',
        company_name: 'Synthetic Labs',
      },
    ],
    education: [
      {
        school: 'Synthetic University',
        degree: 'Computer Science',
      },
    ],
    skills: ['software engineering', 'product systems', 'candidate sourcing'],
    projects: [
      {
        title: 'Synthetic sourcing pipeline validation',
      },
    ],
    email: 'not-stored@example.com',
    phone: '+1-555-000-0000',
  },
};

export class FakeProfessionalProfileLookupProvider implements ProfessionalProfileLookupPort {
  private readonly fixturesByUrl: Map<string, unknown>;

  constructor(fixtures: Record<string, unknown> = defaultFakeLinkedInProfileFixtures) {
    this.fixturesByUrl = new Map(
      Object.entries(fixtures)
        .map(([url, fixture]) => [normalizeLinkedInProfileUrl(url), fixture] as const)
        .filter((entry): entry is readonly [string, unknown] => Boolean(entry[0])),
    );
  }

  async lookupLinkedInProfile(input: ProfessionalProfileLookupInput): Promise<ProfessionalProfileLookupResult> {
    const canonicalUrl = normalizeLinkedInProfileUrl(input.linkedinUrl);
    if (!canonicalUrl) {
      throw new Error('LinkedIn lookup requires a valid linkedin.com/in/... profile URL.');
    }
    const fixture = this.fixturesByUrl.get(canonicalUrl);
    if (!fixture) {
      return {
        provider: 'fake',
        lookupType,
        datasetId: 'fake-linkedin-profiles',
        inputUrl: canonicalUrl,
        status: 'no_match',
        snapshotId: null,
        matches: [],
      };
    }

    const normalizedProfile = normalizeBrightDataLinkedInProfile(fixture, canonicalUrl);
    return {
      provider: 'fake',
      lookupType,
      datasetId: 'fake-linkedin-profiles',
      inputUrl: canonicalUrl,
      status: 'completed',
      snapshotId: null,
      matches: [
        {
          provider: 'fake',
          providerRecordId: `fake:${normalizedProfile.profileUrl.replace(/^https:\/\/www\.linkedin\.com\/in\//, '')}`,
          providerProfileUrl: normalizedProfile.profileUrl,
          normalizedProfile,
        },
      ],
    };
  }
}

export class BrightDataLinkedInProvider implements ProfessionalProfileLookupPort {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly datasetId: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: BrightDataLinkedInProviderConfig) {
    this.apiKey = config.apiKey.trim();
    this.baseUrl = (config.baseUrl ?? defaultBrightDataBaseUrl).replace(/\/+$/, '');
    this.datasetId = config.datasetId ?? brightDataLinkedInProfilesDatasetId;
    this.fetchImpl = config.fetchImpl ?? ((url, init) => fetch(url, init));
    if (!this.apiKey) {
      throw new Error('Missing BRIGHTDATA_API_KEY for Bright Data LinkedIn profile lookup.');
    }
  }

  async lookupLinkedInProfile(input: ProfessionalProfileLookupInput): Promise<ProfessionalProfileLookupResult> {
    const canonicalUrl = normalizeLinkedInProfileUrl(input.linkedinUrl);
    if (!canonicalUrl) {
      throw new Error('LinkedIn lookup requires a valid linkedin.com/in/... profile URL.');
    }

    const endpoint = `${this.baseUrl}/datasets/v3/scrape?dataset_id=${encodeURIComponent(this.datasetId)}&format=json`;
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([{ url: canonicalUrl }]),
    });
    if (!response.ok) {
      throw new Error(`Bright Data LinkedIn lookup failed with status ${response.status}.`);
    }

    const payload = parseJsonText(await response.text());
    const snapshotId = snapshotIdFromPayload(payload);
    if (snapshotId) {
      return {
        provider: 'brightdata',
        lookupType,
        datasetId: this.datasetId,
        inputUrl: canonicalUrl,
        status: 'async_snapshot_pending',
        snapshotId,
        matches: [],
      };
    }

    const matches = recordsFromPayload(payload).map((record, index) => {
      const normalizedProfile = normalizeBrightDataLinkedInProfile(record, canonicalUrl);
      return {
        provider: 'brightdata' as const,
        providerRecordId: firstString(record, ['id', 'profile_id', 'public_identifier'], 160) ?? `row:${index}`,
        providerProfileUrl: normalizedProfile.profileUrl,
        normalizedProfile,
      };
    });

    return {
      provider: 'brightdata',
      lookupType,
      datasetId: this.datasetId,
      inputUrl: canonicalUrl,
      status: matches.length > 0 ? 'completed' : 'no_match',
      snapshotId: null,
      matches,
    };
  }

  async refreshLinkedInProfileSnapshot(
    input: ProfessionalProfileSnapshotRefreshInput,
  ): Promise<ProfessionalProfileLookupResult> {
    const canonicalUrl = normalizeLinkedInProfileUrl(input.linkedinUrl);
    const snapshotId = input.snapshotId.trim();
    if (!canonicalUrl) {
      throw new Error('LinkedIn lookup requires a valid linkedin.com/in/... profile URL.');
    }
    if (!snapshotId) {
      throw new Error('Bright Data snapshot refresh requires a snapshot ID.');
    }

    const progressResponse = await this.fetchImpl(
      `${this.baseUrl}/datasets/v3/progress/${encodeURIComponent(snapshotId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );
    if (!progressResponse.ok) {
      throw new Error(`Bright Data snapshot progress failed with status ${progressResponse.status}.`);
    }
    const progressPayload = parseJsonText(await progressResponse.text());
    const status = snapshotStatusFromPayload(progressPayload);
    if (status && ['running', 'collecting', 'digesting'].includes(status)) {
      return {
        provider: 'brightdata',
        lookupType,
        datasetId: this.datasetId,
        inputUrl: canonicalUrl,
        status: 'async_snapshot_pending',
        snapshotId,
        matches: [],
      };
    }
    if (status === 'failed') {
      throw new Error('Bright Data snapshot failed.');
    }

    const snapshotResponse = await this.fetchImpl(
      `${this.baseUrl}/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      },
    );
    if (!snapshotResponse.ok) {
      throw new Error(`Bright Data snapshot download failed with status ${snapshotResponse.status}.`);
    }
    const payload = parseJsonText(await snapshotResponse.text());
    const matches = recordsFromPayload(payload).map((record, index) => {
      const normalizedProfile = normalizeBrightDataLinkedInProfile(record, canonicalUrl);
      return {
        provider: 'brightdata' as const,
        providerRecordId: firstString(record, ['id', 'profile_id', 'public_identifier'], 160) ?? `row:${index}`,
        providerProfileUrl: normalizedProfile.profileUrl,
        normalizedProfile,
      };
    });

    return {
      provider: 'brightdata',
      lookupType,
      datasetId: this.datasetId,
      inputUrl: canonicalUrl,
      status: matches.length > 0 ? 'completed' : 'no_match',
      snapshotId: null,
      matches,
    };
  }
}
