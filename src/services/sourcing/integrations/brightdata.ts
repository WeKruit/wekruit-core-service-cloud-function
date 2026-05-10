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
const headlineMaxLength = 280;
const currentCompanyMaxLength = 260;
const educationSummaryMaxLength = 420;
const experienceSummaryMaxLength = 900;
const skillMaxLength = 100;
const aboutSummaryMaxLength = 2500;
const projectSummaryMaxLength = 800;

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

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    bull: '-',
    gt: '>',
    hellip: '...',
    ldquo: '"',
    lsquo: "'",
    lt: '<',
    mdash: '-',
    middot: '-',
    nbsp: ' ',
    ndash: '-',
    quot: '"',
    rdquo: '"',
    rsquo: "'",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      const codePoint = Number.parseInt(lower.slice(2), 16);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    if (lower.startsWith('#')) {
      const codePoint = Number.parseInt(lower.slice(1), 10);
      return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match;
    }
    return namedEntities[lower] ?? match;
  });
}

function textFromHtml(value: string): string {
  const withBreaks = value
    .replace(/<\s*br\s*\/?\s*>/gi, ' ')
    .replace(/<\/\s*(p|div|li|tr|td|h[1-6])\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return decodeHtmlEntities(withBreaks).replace(/<[^>]*>/g, ' ');
}

function cleanText(value: string, maxLength: number): string | null {
  const normalized = textFromHtml(value).replace(/\s+/g, ' ').trim();
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

function firstUrl(record: Record<string, unknown>, keys: string[], maxLength = 300): string | null {
  for (const key of keys) {
    const direct = stringFromUnknown(record[key], maxLength);
    if (direct && /^https?:\/\//i.test(direct)) {
      return direct;
    }
  }
  return null;
}

function compactList(values: Array<string | null>, maxItems: number): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .slice(0, maxItems);
}

function sameText(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function compactSummaryParts(parts: Array<string | null>, maxLength: number): string | null {
  const seen = new Set<string>();
  const uniqueParts = parts
    .map((part) => part ? cleanText(part, maxLength) : null)
    .filter((part): part is string => Boolean(part))
    .filter((part) => {
      const key = part.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  return cleanText(uniqueParts.join(' | '), maxLength);
}

function labeledPart(label: string, value: string | null): string | null {
  return value ? `${label}: ${value}` : null;
}

function summarizeDate(value: unknown): string | null {
  const direct = stringFromUnknown(value, 80);
  if (direct) {
    return direct;
  }
  if (!isPlainRecord(value)) {
    return null;
  }
  const month = firstString(value, ['month'], 20);
  const year = firstString(value, ['year'], 20);
  const day = firstString(value, ['day'], 20);
  return compactSummaryParts([year, month, day], 80)?.replace(/ \| /g, '-') ?? null;
}

function summarizeDateRange(record: Record<string, unknown>): string | null {
  const start = firstString(record, ['start_date', 'startDate', 'date_from', 'dateFrom', 'from', 'start'], 80)
    ?? summarizeDate(record.starts_at ?? record.start_at ?? record.start);
  const end = firstString(record, ['end_date', 'endDate', 'date_to', 'dateTo', 'to', 'end'], 80)
    ?? summarizeDate(record.ends_at ?? record.end_at ?? record.end);
  if (start || end) {
    return cleanText([start, end ?? 'Present'].filter(Boolean).join(' - '), 160);
  }
  return firstString(record, ['date_range', 'dateRange', 'duration', 'period'], 160);
}

function summarizeCompany(value: unknown, maxLength = currentCompanyMaxLength): string | null {
  if (isPlainRecord(value)) {
    const name = firstString(value, ['name', 'company_name', 'current_company_name', 'title'], 180);
    const location = firstString(value, ['location', 'company_location', 'address'], 120);
    const link = firstUrl(value, ['link', 'url', 'company_url', 'companyUrl', 'profile_url', 'linkedin_url']);
    if (name && !location && !link) {
      return cleanText(name, maxLength);
    }
    return compactSummaryParts([
      labeledPart('Name', name),
      labeledPart('Location', location),
      labeledPart('URL', link),
    ], maxLength);
  }
  return stringFromUnknown(value, maxLength);
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

function nestedRecordValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function expandExperienceEntry(value: unknown): unknown[] {
  if (!isPlainRecord(value)) {
    return [value];
  }
  for (const key of ['positions', 'position_groups', 'roles', 'jobs']) {
    const nested = value[key];
    if (!Array.isArray(nested)) {
      continue;
    }
    return nested.map((entry) => {
      if (!isPlainRecord(entry)) {
        return entry;
      }
      return {
        ...value,
        ...entry,
        company: entry.company ?? value.company ?? value.company_name ?? value.current_company,
        company_name: entry.company_name ?? value.company_name,
        company_linkedin_url: entry.company_linkedin_url ?? value.company_linkedin_url ?? value.company_url,
      };
    });
  }
  return [value];
}

function summarizeExperienceItem(value: unknown): string | null {
  if (!isPlainRecord(value)) {
    return stringFromUnknown(value, experienceSummaryMaxLength);
  }
  const companyValue = nestedRecordValue(value, ['company', 'company_name', 'current_company', 'organization']);
  const company = summarizeCompany(companyValue, 260);
  const title = firstString(value, ['title', 'position', 'role', 'name'], 180);
  const subtitle = firstString(value, ['subtitle', 'sub_title', 'headline'], 220);
  const dateRange = summarizeDateRange(value);
  const location = firstString(value, ['location', 'company_location', 'geo_location'], 160);
  const description = firstString(value, ['description', 'description_html', 'summary', 'about', 'details'], 520);
  const companyLink = firstUrl(value, [
    'company_linkedin_url',
    'company_url',
    'companyUrl',
    'company_profile_url',
    'companyProfileUrl',
    'link',
    'url',
  ]);
  const role = sameText(title, company) ? null : title;
  const fallback = role && company ? `${role} at ${company}` : role ?? company;
  return compactSummaryParts([
    fallback && !subtitle && !dateRange && !location && !description && !companyLink ? fallback : null,
    labeledPart('Title', role),
    labeledPart('Company', company),
    labeledPart('Dates', dateRange),
    labeledPart('Location', location),
    labeledPart('Summary', sameText(subtitle, description) ? null : subtitle),
    labeledPart('Description', description),
    labeledPart('URL', companyLink),
  ], experienceSummaryMaxLength);
}

function summarizeEducationItem(value: unknown): string | null {
  if (!isPlainRecord(value)) {
    return stringFromUnknown(value, educationSummaryMaxLength);
  }
  const school = firstString(value, ['school', 'school_name', 'title', 'name'], 160);
  const degree = firstString(value, ['degree', 'degree_name'], 140);
  const field = firstString(value, ['field', 'field_of_study', 'fieldOfStudy', 'major'], 140);
  const dateRange = summarizeDateRange(value);
  const description = firstString(value, ['description', 'activities', 'summary', 'details'], 220);
  if (school && degree && !field && !dateRange && !description) {
    return cleanText([school, degree].filter(Boolean).join(' | '), educationSummaryMaxLength);
  }
  return compactSummaryParts([
    labeledPart('School', school),
    labeledPart('Degree', degree),
    labeledPart('Field', field),
    labeledPart('Dates', dateRange),
    labeledPart('Details', description),
  ], educationSummaryMaxLength);
}

function summarizeProjectItem(value: unknown): string | null {
  if (!isPlainRecord(value)) {
    return stringFromUnknown(value, projectSummaryMaxLength);
  }
  const title = firstString(value, ['title', 'name', 'publication_title', 'project_name', 'patent_title'], 180);
  const description = firstString(value, ['description', 'description_html', 'summary', 'about', 'details'], 420);
  const dateRange = summarizeDateRange(value);
  const publisher = firstString(value, ['publisher', 'publication', 'organization', 'company'], 160);
  const url = firstUrl(value, [
    'url',
    'link',
    'project_url',
    'projectUrl',
    'publication_url',
    'publicationUrl',
    'patent_url',
    'patentUrl',
  ]);
  if (title && !description && !dateRange && !publisher && !url) {
    return cleanText(title, projectSummaryMaxLength);
  }
  return compactSummaryParts([
    labeledPart('Title', title),
    labeledPart('Description', description),
    labeledPart('Dates', dateRange),
    labeledPart('Source', publisher),
    labeledPart('URL', url),
  ], projectSummaryMaxLength);
}

function summarizeSkillItem(value: unknown): string | null {
  if (isPlainRecord(value)) {
    return firstString(value, ['name', 'skill', 'title'], skillMaxLength);
  }
  return stringFromUnknown(value, skillMaxLength);
}

function listFromUnknown(
  value: unknown,
  summarizer: (entry: unknown) => string | null,
  maxItems: number,
  expandEntry?: (entry: unknown) => unknown[],
): string[] {
  if (Array.isArray(value)) {
    return compactList(value.flatMap((entry) => (expandEntry ? expandEntry(entry) : [entry])).map((entry) => summarizer(entry)), maxItems);
  }
  return compactList((expandEntry ? expandEntry(value) : [value]).map((entry) => summarizer(entry)), maxItems);
}

function mergeListValues(
  values: unknown[],
  summarizer: (entry: unknown) => string | null,
  maxItems: number,
  expandEntry?: (entry: unknown) => unknown[],
): string[] {
  return compactList(
    values.flatMap((value) => listFromUnknown(value, summarizer, maxItems, expandEntry)),
    maxItems,
  );
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
  const currentCompany = summarizeCompany(
    record.current_company ?? record.current_company_name ?? record.company ?? record.company_name,
  );

  return normalizedProfessionalProfileSummarySchema.parse({
    profileUrl,
    name,
    headline: firstString(record, ['headline', 'position', 'title', 'occupation', 'sub_title'], headlineMaxLength),
    currentCompany,
    location: summarizeLocation(record),
    educationSummary: mergeListValues([record.education, record.educations_details], summarizeEducationItem, 10),
    experienceSummary: mergeListValues(
      [record.experience, record.experiences, record.volunteer_experience],
      summarizeExperienceItem,
      10,
      expandExperienceEntry,
    ),
    skills: mergeListValues([record.skills, record.skill], summarizeSkillItem, 40),
    aboutSummary: firstString(
      record,
      ['about', 'about_html', 'summary', 'summary_html', 'description', 'description_html'],
      aboutSummaryMaxLength,
    ),
    projectsPublications: compactList(
      [
        ...listFromUnknown(record.projects, summarizeProjectItem, 12),
        ...listFromUnknown(record.publications, summarizeProjectItem, 12),
        ...listFromUnknown(record.patents, summarizeProjectItem, 12),
      ],
      12,
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
      link: 'https://www.linkedin.com/company/wekruit-test-fixture',
      location: 'Los Angeles',
    },
    city: 'San Francisco Bay Area',
    country_code: 'US',
    about: [
      'Synthetic local fixture for validating the Bright Data enrichment workflow.',
      'Builds evidence-grounded sourcing systems, candidate review tools, and professional profile enrichment loops.',
      'This public fixture text is intentionally rich enough to prove downstream enrichment receives more than labels.',
    ].join(' '),
    experience: [
      {
        title: 'Founder and builder',
        company_name: 'Synthetic Labs',
        start_date: '2024',
        end_date: 'Present',
        location: 'Los Angeles',
        description_html:
          '<p>Built a sourcing pipeline that combines approved candidate evidence, Bright Data profile context, and OpenAI enrichment review.</p>',
        company_linkedin_url: 'https://www.linkedin.com/company/synthetic-labs',
      },
    ],
    education: [
      {
        school: 'Synthetic University',
        degree: 'Computer Science',
        field: 'Software systems',
        start_date: '2021',
        end_date: '2025',
        description: 'Focused on full-stack engineering, data systems, and human-in-the-loop review products.',
      },
    ],
    skills: ['software engineering', 'product systems', 'candidate sourcing'],
    projects: [
      {
        title: 'Synthetic sourcing pipeline validation',
        description: 'End-to-end validation project for vendor profile lookup, review approval, and evidence-backed enrichment.',
        url: 'https://example.test/synthetic-sourcing-pipeline',
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
      body: JSON.stringify({ input: [{ url: canonicalUrl }] }),
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
