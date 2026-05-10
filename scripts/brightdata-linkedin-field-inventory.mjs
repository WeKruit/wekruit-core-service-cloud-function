import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);

const {
  brightDataLinkedInProfilesDatasetId,
  normalizeBrightDataLinkedInProfile,
} = require('../lib/services/sourcing/integrations/brightdata.js');

const defaultUrl = 'https://www.linkedin.com/in/spencerwang1';
const args = new Map();
for (const arg of process.argv.slice(2)) {
  const [key, value] = arg.split('=');
  if (key?.startsWith('--')) {
    args.set(key.slice(2), value ?? 'true');
  }
}

const linkedinUrl = String(args.get('url') ?? defaultUrl).trim();
const bodyShape = String(args.get('body') ?? 'input').trim();
const allowedBodyShapes = new Set(['array', 'input', 'both']);

if (!allowedBodyShapes.has(bodyShape)) {
  throw new Error('--body must be one of: array, input, both');
}

if (process.env.CONFIRM_BRIGHTDATA_LIVE_DIAGNOSTIC !== '1') {
  throw new Error('Set CONFIRM_BRIGHTDATA_LIVE_DIAGNOSTIC=1 to run a live Bright Data diagnostic call.');
}

function localEnvValue(name) {
  let current = root;
  for (let depth = 0; depth < 8; depth += 1) {
    const path = join(current, '.env');
    if (existsSync(path)) {
      for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
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

function apiKey() {
  const value = (process.env.BRIGHTDATA_API_KEY ?? localEnvValue('BRIGHTDATA_API_KEY')).trim();
  if (!value) {
    throw new Error('Missing BRIGHTDATA_API_KEY.');
  }
  return value;
}

function cleanPreview(value, maxLength = 120) {
  const normalized = String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
}

function typeSummary(value, allowPreview = false) {
  if (value === null) {
    return { type: 'null' };
  }
  if (Array.isArray(value)) {
    return { type: 'array', count: value.length };
  }
  if (typeof value === 'object') {
    return { type: 'object', keys: Object.keys(value).sort() };
  }
  if (typeof value === 'string') {
    return {
      type: 'string',
      length: value.length,
      ...(allowPreview ? { preview: cleanPreview(value) } : {}),
    };
  }
  return { type: typeof value, value };
}

function recordAtPath(record, path) {
  return path.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    return current[key];
  }, record);
}

function inspectList(record, key, previewKeys) {
  const value = record[key];
  if (!Array.isArray(value)) {
    return typeSummary(value);
  }
  return {
    type: 'array',
    count: value.length,
    sample: value.slice(0, 3).map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return typeSummary(entry, true);
      }
      const object = {};
      for (const previewKey of previewKeys) {
        if (entry[previewKey] !== undefined) {
          object[previewKey] = typeSummary(entry[previewKey], true);
        }
      }
      object.keys = Object.keys(entry).sort();
      return object;
    }),
  };
}

function fieldInventory(record) {
  const scalarPreviewKeys = [
    'name',
    'first_name',
    'last_name',
    'headline',
    'position',
    'title',
    'about',
    'summary',
    'description',
    'current_company_name',
    'location',
    'city',
    'country_code',
    'url',
    'input_url',
  ];
  const topLevel = {};
  for (const key of Object.keys(record).sort()) {
    topLevel[key] = typeSummary(record[key], scalarPreviewKeys.includes(key));
  }

  const selected = {};
  for (const key of scalarPreviewKeys) {
    if (record[key] !== undefined) {
      selected[key] = typeSummary(record[key], true);
    }
  }
  for (const path of [
    'current_company.name',
    'current_company.link',
    'current_company.location',
    'current_company.company_id',
  ]) {
    const value = recordAtPath(record, path);
    if (value !== undefined) {
      selected[path] = typeSummary(value, true);
    }
  }

  const lists = {
    experience: inspectList(record, 'experience', [
      'title',
      'position',
      'subtitle',
      'company',
      'company_name',
      'description',
      'description_html',
      'start_date',
      'end_date',
      'location',
      'url',
      'company_linkedin_url',
    ]),
    experiences: inspectList(record, 'experiences', [
      'title',
      'position',
      'company',
      'company_name',
      'description',
      'description_html',
    ]),
    education: inspectList(record, 'education', [
      'school',
      'school_name',
      'degree',
      'field',
      'description',
      'activities',
      'start_date',
      'end_date',
    ]),
    educations_details: inspectList(record, 'educations_details', [
      'school',
      'school_name',
      'degree',
      'field',
      'description',
      'activities',
    ]),
    skills: inspectList(record, 'skills', ['name', 'skill', 'title']),
    projects: inspectList(record, 'projects', ['title', 'name', 'description', 'description_html', 'url', 'project_url']),
    publications: inspectList(record, 'publications', ['title', 'name', 'publication_title', 'description', 'url']),
    patents: inspectList(record, 'patents', ['title', 'name', 'patent_title', 'description', 'url']),
    volunteer_experience: inspectList(record, 'volunteer_experience', [
      'title',
      'role',
      'company',
      'organization',
      'description',
      'description_html',
    ]),
    certifications: inspectList(record, 'certifications', ['name', 'title', 'authority', 'description']),
    courses: inspectList(record, 'courses', ['name', 'title', 'number']),
    organizations: inspectList(record, 'organizations', ['name', 'title', 'description']),
    honors_and_awards: inspectList(record, 'honors_and_awards', ['name', 'title', 'description', 'issuer']),
  };

  return { topLevel, selected, lists };
}

function recordsFromPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((value) => value && typeof value === 'object' && !Array.isArray(value));
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  for (const key of ['data', 'results', 'items']) {
    if (Array.isArray(payload[key])) {
      return payload[key].filter((value) => value && typeof value === 'object' && !Array.isArray(value));
    }
  }
  return [];
}

async function run(shape) {
  const endpoint = `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${encodeURIComponent(brightDataLinkedInProfilesDatasetId)}&format=json&include_errors=true`;
  const body = shape === 'input'
    ? { input: [{ url: linkedinUrl }] }
    : [{ url: linkedinUrl }];
  const startedAt = new Date().toISOString();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text.trim() ? JSON.parse(text) : [];
  const records = recordsFromPayload(payload);
  const normalized = records.map((record) => normalizeBrightDataLinkedInProfile(record, linkedinUrl));

  return {
    diagnostic: {
      startedAt,
      bodyShape: shape,
      request: {
        endpoint: '/datasets/v3/scrape',
        datasetId: brightDataLinkedInProfilesDatasetId,
        url: linkedinUrl,
        bodyShape: shape,
      },
      response: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        recordCount: records.length,
        payloadKind: Array.isArray(payload) ? 'array' : typeof payload,
        topLevelPayloadKeys: payload && typeof payload === 'object' && !Array.isArray(payload)
          ? Object.keys(payload).sort()
          : [],
      },
    },
    records: records.map((record, index) => ({
      index,
      inventory: fieldInventory(record),
      normalizedProfile: normalized[index],
    })),
  };
}

const shapes = bodyShape === 'both' ? ['array', 'input'] : [bodyShape];
const results = [];
for (const shape of shapes) {
  results.push(await run(shape));
}

console.log(JSON.stringify({ linkedinUrl, results }, null, 2));
