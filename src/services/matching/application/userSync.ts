import { createHash } from 'node:crypto';

import type {
  PlatformUserPreferences,
  PlatformUserRecord,
  PlatformUserRemotePreference,
  PlatformUserSalaryRange,
  PlatformUserSyncState,
} from '../domain/platformUser';

export interface MatchingWebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  schema: string;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
}

export interface ValetUserRow {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  location: string | null;
  skills: unknown;
  preferences: unknown;
  status: string;
  subscriptionTier: string;
  updatedAt: string | null;
}

export interface ValetApplicationProfileRow {
  userId: string;
  workAuthorization: string | null;
  visaSponsorship: string | null;
  preferredWorkMode: string | null;
  preferredLocations: string | null;
  updatedAt: string | null;
}

export interface ValetParsedResumeData {
  summary?: unknown;
  totalYearsExperience?: unknown;
}

export interface ValetResumeRow {
  userId: string;
  status: string;
  isDefault: boolean;
  parsedData: ValetParsedResumeData | null;
  parsedAt: string | null;
}

export interface ValetUserAggregate {
  user: ValetUserRow;
  applicationProfile: ValetApplicationProfileRow | null;
  defaultResume: ValetResumeRow | null;
}

export interface PlatformUserSyncSource {
  getAggregatedUser(uid: string): Promise<ValetUserAggregate | null>;
}

export interface PlatformUserSyncRepository {
  getSyncState(uid: string): Promise<PlatformUserSyncState | null>;
  upsert(record: PlatformUserRecord): Promise<void>;
}

export interface PlatformUserSyncLogger {
  info(payload: Record<string, unknown>, message: string): void;
  warn(payload: Record<string, unknown>, message: string): void;
  error(payload: Record<string, unknown>, message: string): void;
}

export interface PlatformUserSyncDependencies {
  source: PlatformUserSyncSource;
  repository: PlatformUserSyncRepository;
  logger: PlatformUserSyncLogger;
  now?: () => Date;
}

export interface SyncPlatformUserResult {
  kind: 'updated' | 'deduplicated' | 'ignored';
  uid: string | null;
  eventType: 'INSERT' | 'UPDATE';
  syncedAt: string;
  reason?: string;
}

const SUPPORTED_SYNC_TABLES = new Set(['users', 'user_application_profiles', 'resumes']);

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const unique = new Set<string>();
  for (const item of value) {
    const normalized = normalizeString(item);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function parseCsvList(value: unknown): string[] {
  if (typeof value !== 'string') {
    return [];
  }

  const unique = new Set<string>();
  for (const part of value.split(',')) {
    const normalized = normalizeString(part);
    if (normalized) {
      unique.add(normalized);
    }
  }

  return [...unique];
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function normalizeRemotePreference(value: unknown): PlatformUserRemotePreference {
  const normalized = normalizeString(value)?.toLowerCase();
  if (
    normalized === 'remote' ||
    normalized === 'hybrid' ||
    normalized === 'onsite' ||
    normalized === 'any'
  ) {
    return normalized;
  }

  return 'any';
}

function normalizeSalaryRange(value: unknown): PlatformUserSalaryRange | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybeRange = value as Record<string, unknown>;
  const min = normalizeNumber(maybeRange.min);
  const max = normalizeNumber(maybeRange.max);
  const currency = normalizeString(maybeRange.currency) ?? 'USD';

  if (min === null || max === null) {
    return null;
  }

  return {
    min,
    max,
    currency,
  };
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizePreferences(
  value: unknown,
  fallbackLocation: string | null,
  applicationProfile: ValetApplicationProfileRow | null,
): PlatformUserPreferences {
  const rawPreferences =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const jobPreferences =
    rawPreferences.jobPreferences && typeof rawPreferences.jobPreferences === 'object'
      ? (rawPreferences.jobPreferences as Record<string, unknown>)
      : rawPreferences;

  const preferredLocations = normalizeStringArray(jobPreferences.preferredLocations);
  if (preferredLocations.length === 0) {
    preferredLocations.push(...parseCsvList(applicationProfile?.preferredLocations ?? null));
  }
  if (preferredLocations.length === 0 && fallbackLocation) {
    preferredLocations.push(fallbackLocation);
  }

  return {
    targetJobTitles: normalizeStringArray(jobPreferences.targetJobTitles),
    jobType: normalizeString(jobPreferences.jobType),
    preferredLocations,
    preferredIndustries:
      normalizeStringArray(jobPreferences.preferredIndustries).length > 0
        ? normalizeStringArray(jobPreferences.preferredIndustries)
        : normalizeStringArray(jobPreferences.industries),
    remotePreference:
      normalizeRemotePreference(jobPreferences.remotePreference) !== 'any'
        ? normalizeRemotePreference(jobPreferences.remotePreference)
        : normalizeRemotePreference(applicationProfile?.preferredWorkMode),
    excludedCompanies: normalizeStringArray(jobPreferences.excludedCompanies),
    minimumSalary: normalizeNumber(jobPreferences.minimumSalary),
    salaryRange: normalizeSalaryRange(jobPreferences.salaryRange),
    experienceLevel: normalizeString(jobPreferences.experienceLevel),
    companySizePreference: normalizeString(jobPreferences.companySizePref),
    sponsorshipNeeded: normalizeBoolean(jobPreferences.sponsorshipNeeded),
  };
}

function buildPayloadFingerprint(payload: Omit<PlatformUserRecord, 'sourcePayloadHash' | 'syncedAt'>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export function buildPlatformUserRecord(input: {
  aggregate: ValetUserAggregate;
  webhook: MatchingWebhookPayload;
  syncedAt: string;
}): PlatformUserRecord {
  const { aggregate, webhook, syncedAt } = input;
  const preferences = normalizePreferences(
    aggregate.user.preferences,
    aggregate.user.location,
    aggregate.applicationProfile,
  );

  const payload: Omit<PlatformUserRecord, 'sourcePayloadHash' | 'syncedAt'> = {
    uid: aggregate.user.id,
    email: aggregate.user.email,
    name: aggregate.user.name,
    avatarUrl: aggregate.user.avatarUrl,
    location: aggregate.user.location,
    status: aggregate.user.status,
    subscriptionTier: aggregate.user.subscriptionTier,
    skills: normalizeStringArray(aggregate.user.skills),
    preferences,
    workAuthorization: normalizeString(aggregate.applicationProfile?.workAuthorization),
    visaSponsorship: normalizeString(aggregate.applicationProfile?.visaSponsorship),
    resumeSummary: normalizeString(aggregate.defaultResume?.parsedData?.summary),
    totalYearsExperience: normalizeNumber(aggregate.defaultResume?.parsedData?.totalYearsExperience),
    source: {
      eventType: webhook.type,
      table: webhook.table,
      schema: webhook.schema,
      usersUpdatedAt: aggregate.user.updatedAt,
      applicationProfileUpdatedAt: aggregate.applicationProfile?.updatedAt ?? null,
      defaultResumeParsedAt: aggregate.defaultResume?.parsedAt ?? null,
    },
  };

  return {
    ...payload,
    sourcePayloadHash: buildPayloadFingerprint(payload),
    syncedAt,
  };
}

export function shouldSkipPlatformUserWrite(
  existing: PlatformUserSyncState | null,
  incoming: PlatformUserRecord,
) {
  return existing?.sourcePayloadHash === incoming.sourcePayloadHash;
}

export function extractWebhookUid(payload: MatchingWebhookPayload): string | null {
  const preferUserId = payload.table !== 'users';
  const recordId = normalizeString(payload.record.id);
  const recordUserId = normalizeString(payload.record.user_id);
  if (preferUserId && recordUserId) {
    return recordUserId;
  }
  if (recordId) {
    return recordId;
  }
  if (recordUserId) {
    return recordUserId;
  }

  if (!payload.old_record || typeof payload.old_record !== 'object') {
    return null;
  }

  const oldRecord = payload.old_record as Record<string, unknown>;
  const oldRecordId = normalizeString(oldRecord.id);
  const oldRecordUserId = normalizeString(oldRecord.user_id);
  if (preferUserId && oldRecordUserId) {
    return oldRecordUserId;
  }
  return oldRecordId ?? oldRecordUserId;
}

export function isValidWebhookAuth(authorizationHeader: string | undefined, apiKey: string) {
  return authorizationHeader === `Bearer ${apiKey}`;
}

export async function syncPlatformUserFromWebhook(
  payload: MatchingWebhookPayload,
  dependencies: PlatformUserSyncDependencies,
): Promise<SyncPlatformUserResult> {
  const startedAt = (dependencies.now ?? (() => new Date()))();
  const syncedAt = startedAt.toISOString();

  if (!SUPPORTED_SYNC_TABLES.has(payload.table)) {
    dependencies.logger.warn(
      {
        eventType: payload.type,
        table: payload.table,
        schema: payload.schema,
        syncedAt,
      },
      'Ignoring matching user sync webhook for unsupported table',
    );

    return {
      kind: 'ignored',
      uid: null,
      eventType: payload.type,
      syncedAt,
      reason: 'unsupported_table',
    };
  }

  const uid = extractWebhookUid(payload);
  if (!uid) {
    dependencies.logger.warn(
      {
        eventType: payload.type,
        table: payload.table,
        schema: payload.schema,
        syncedAt,
      },
      'Ignoring matching user sync webhook without a user id',
    );

    return {
      kind: 'ignored',
      uid: null,
      eventType: payload.type,
      syncedAt,
      reason: 'missing_uid',
    };
  }

  const aggregate = await dependencies.source.getAggregatedUser(uid);
  if (!aggregate) {
    dependencies.logger.error(
      {
        uid,
        eventType: payload.type,
        syncedAt,
      },
      'Failed to load VALET user aggregate for matching sync',
    );
    throw new Error(`VALET user "${uid}" was not found during matching sync.`);
  }

  const record = buildPlatformUserRecord({
    aggregate,
    webhook: payload,
    syncedAt,
  });

  const existing = await dependencies.repository.getSyncState(uid);
  if (shouldSkipPlatformUserWrite(existing, record)) {
    dependencies.logger.info(
      {
        uid,
        eventType: payload.type,
        syncedAt,
        deduplicated: true,
      },
      'Matching user sync deduplicated duplicate delivery',
    );

    return {
      kind: 'deduplicated',
      uid,
      eventType: payload.type,
      syncedAt,
    };
  }

  await dependencies.repository.upsert(record);

  dependencies.logger.info(
    {
      uid,
      eventType: payload.type,
      syncedAt,
      durationMs: (dependencies.now ?? (() => new Date()))().getTime() - startedAt.getTime(),
    },
    'Matching user sync completed',
  );

  return {
    kind: 'updated',
    uid,
    eventType: payload.type,
    syncedAt,
  };
}
