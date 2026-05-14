import { createHash } from 'node:crypto';

import type {
  EvidenceRecord,
  SourceRecord,
  SourcingEvidenceQuality,
  SourcingEvidenceType,
} from '../domain/records';

export const sourcingEvidenceExtractorVersion = 'sourcing-evidence-v1';

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const orcidRegex = /\b\d{4}-\d{4}-\d{4}-[\dX]{4}\b/gi;
const doiRegex = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;
const urlRegex = /https?:\/\/[^\s"'<>]+/gi;

export function stableHash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function normalizeUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    url.hash = '';
    if (url.pathname !== '/') {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return input.trim().replace(/\/+$/, '').toLowerCase();
  }
}

export function normalizeName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, ' ');
}

export function buildNameInstitutionKey(name: string | undefined, institution: string | undefined): string | null {
  if (!name || !institution) {
    return null;
  }
  const normalizedName = normalizeName(name);
  const normalizedInstitution = normalizeName(institution);
  if (!normalizedName || !normalizedInstitution) {
    return null;
  }
  return `${normalizedName}::${normalizedInstitution}`;
}

function normalizeEvidenceValue(type: SourcingEvidenceType, value: string): string {
  const trimmed = value.trim();
  if (type === 'email') {
    return trimmed.toLowerCase();
  }
  if (type === 'homepage' || type === 'github' || type === 'source_url') {
    return normalizeUrl(trimmed);
  }
  if (type === 'orcid') {
    return trimmed.toUpperCase();
  }
  if (type === 'paper_doi') {
    return trimmed.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  }
  if (type === 'name' || type === 'institution') {
    return normalizeName(trimmed);
  }
  return trimmed.toLowerCase();
}

function evidenceQuality(type: SourcingEvidenceType): SourcingEvidenceQuality {
  if (['email', 'orcid', 'github', 'dblp', 'openreview', 'google_scholar', 'source_native_id'].includes(type)) {
    return 'high';
  }
  if (['homepage', 'paper_doi', 'source_url'].includes(type)) {
    return 'medium';
  }
  return 'low';
}

function collectCandidateValues(input: unknown, path = 'raw'): Array<{ path: string; value: string }> {
  if (input === null || input === undefined) {
    return [];
  }

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return [{ path, value: String(input) }];
  }

  if (Array.isArray(input)) {
    return input.flatMap((entry, index) => collectCandidateValues(entry, `${path}[${index}]`));
  }

  if (typeof input === 'object') {
    return Object.entries(input as Record<string, unknown>).flatMap(([key, value]) =>
      collectCandidateValues(value, `${path}.${key}`),
    );
  }

  return [];
}

function detectTypedValues(path: string, value: string): Array<{ type: SourcingEvidenceType; rawValue: string; path: string }> {
  const lowerPath = path.toLowerCase();
  const values: Array<{ type: SourcingEvidenceType; rawValue: string; path: string }> = [];

  for (const email of value.match(emailRegex) ?? []) {
    values.push({ type: 'email', rawValue: email, path });
  }
  for (const orcid of value.match(orcidRegex) ?? []) {
    values.push({ type: 'orcid', rawValue: orcid, path });
  }
  for (const doi of value.match(doiRegex) ?? []) {
    values.push({ type: 'paper_doi', rawValue: doi, path });
  }

  const trimmed = value.trim();
  if (lowerPath.includes('homepage') || lowerPath.includes('website') || lowerPath.includes('url')) {
    for (const url of trimmed.match(urlRegex) ?? []) {
      values.push({ type: 'homepage', rawValue: url, path });
    }
  }
  if (lowerPath.includes('github') || /github\.com\//i.test(trimmed)) {
    for (const url of trimmed.match(urlRegex) ?? []) {
      values.push({ type: 'github', rawValue: url, path });
    }
  }
  if (lowerPath.includes('dblp') || /dblp\.org\/pid\//i.test(trimmed)) {
    values.push({ type: 'dblp', rawValue: trimmed, path });
  }
  if (lowerPath.includes('openreview') || /openreview\.net\/profile\?id=/i.test(trimmed) || /^~[A-Za-z0-9_]+/.test(trimmed)) {
    values.push({ type: 'openreview', rawValue: trimmed, path });
  }
  if (lowerPath.includes('scholar') || /scholar\.google\./i.test(trimmed)) {
    values.push({ type: 'google_scholar', rawValue: trimmed, path });
  }
  if (lowerPath.includes('institution') || lowerPath.includes('affiliation') || lowerPath.endsWith('.company')) {
    values.push({ type: 'institution', rawValue: trimmed, path });
  }
  if (lowerPath.endsWith('.name') || lowerPath.endsWith('.displayname') || lowerPath.endsWith('.display_name')) {
    values.push({ type: 'name', rawValue: trimmed, path });
  }

  return values;
}

export function extractEvidenceFromSourceRecord(record: SourceRecord, now = new Date().toISOString()): EvidenceRecord[] {
  const candidates: Array<{ type: SourcingEvidenceType; rawValue: string; path: string }> = [];

  if (record.sourceUrl) {
    candidates.push({ type: 'source_url', rawValue: record.sourceUrl, path: 'sourceUrl' });
    candidates.push(...detectTypedValues('sourceUrl', record.sourceUrl));
  }
  if (record.sourceNativeId) {
    candidates.push({ type: 'source_native_id', rawValue: `${record.sourceName}:${record.sourceNativeId}`, path: 'sourceNativeId' });
    const sourceName = record.sourceName.toLowerCase();
    if (sourceName.includes('dblp')) {
      candidates.push({ type: 'dblp', rawValue: record.sourceNativeId, path: 'sourceNativeId' });
    }
    if (sourceName.includes('openreview')) {
      candidates.push({ type: 'openreview', rawValue: record.sourceNativeId, path: 'sourceNativeId' });
    }
    if (sourceName.includes('google') || sourceName.includes('scholar')) {
      candidates.push({ type: 'google_scholar', rawValue: record.sourceNativeId, path: 'sourceNativeId' });
    }
  }
  if (record.displayName) {
    candidates.push({ type: 'name', rawValue: record.displayName, path: 'displayName' });
  }
  if (record.institution) {
    candidates.push({ type: 'institution', rawValue: record.institution, path: 'institution' });
  }

  for (const section of ['display', 'rawSummary', 'raw'] as const) {
    for (const entry of collectCandidateValues(record[section], section)) {
      candidates.push(...detectTypedValues(entry.path, entry.value));
    }
  }

  const deduped = new Map<string, EvidenceRecord>();
  for (const candidate of candidates) {
    const normalizedValue = normalizeEvidenceValue(candidate.type, candidate.rawValue);
    if (!normalizedValue) {
      continue;
    }
    const valueHash = stableHash(`${candidate.type}:${normalizedValue}`);
    const id = stableHash(`${record.id}:${candidate.type}:${normalizedValue}`).slice(0, 32);
    deduped.set(id, {
      id,
      sourceRunId: record.sourceRunId,
      sourceRecordId: record.id,
      sourceName: record.sourceName,
      sourceDomain: record.sourceDomain,
      entityType: record.entityType,
      evidenceType: candidate.type,
      rawValue: candidate.rawValue,
      normalizedValue,
      valueHash,
      quality: evidenceQuality(candidate.type),
      extractedFrom: {
        sourcePath: candidate.path,
        sourceUrl: record.sourceUrl ?? null,
      },
      observedAt: record.observedAt ?? now,
      extractorVersion: sourcingEvidenceExtractorVersion,
      createdAt: now,
      updatedAt: now,
    });
  }

  return [...deduped.values()];
}
