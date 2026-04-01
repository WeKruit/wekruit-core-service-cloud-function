import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { Request, Response } from 'express';
import { DateTime } from 'luxon';
import { z } from 'zod';

import type { OutboundDispatchProfile, OutboundDispatchProfileSeed } from '../domain/dispatch-profile';
import type {
  OutboundAdminBookingDetails,
  OutboundAdminSchedulingInviteDetails,
  OutboundBookingDetails,
  OutboundSchedulingInviteRecord,
} from '../domain/records';
import type { OutboundRuntimeConfig } from './runtime';

export const bookingRequestSchema = z.object({
  fullName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8),
  slotStart: z.string().datetime(),
});

export const adminInviteRequestSchema = z.object({
  profileSlug: z.string().trim().min(1),
  batchLabel: z.string().trim().optional().default(''),
  candidates: z.string().trim().min(1),
});

export const adminTestCallRequestSchema = z.object({
  profileSlug: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8),
  offsetMinutes: z.coerce.number().int().min(1).max(120).default(2),
});

export const adminInviteWavePreviewSchema = z.object({
  batchLabel: z.string().trim().optional().default(''),
  candidates: z.string().trim().min(1),
});

export const reviewedInviteWaveRowSchema = z.object({
  rowId: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().min(8),
  school: z.string().optional(),
  campaign: z.string().optional(),
  purpose: z.string().optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  selectedProfileSlug: z
    .string()
    .trim()
    .min(1, 'Every candidate row needs a resolved dispatch profile before send.'),
});

export const adminInviteWaveSendSchema = z.object({
  batchLabel: z.string().trim().optional().default(''),
  rows: z.array(reviewedInviteWaveRowSchema).min(1),
});

export const outboundDispatchProfileSeedSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  school: z.string().trim().min(1).optional(),
  campaign: z.string().trim().min(1).optional(),
  purpose: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
  retellAgentId: z.string().trim().min(1),
  retellFromPhoneNumber: z.string().trim().min(1),
  googleCalendarSubject: z.string().trim().email(),
  googleCalendarId: z.string().trim().min(1),
  bookingAccessMode: z.enum(['public', 'invite_only']).default('invite_only'),
  publicTitle: z.string().trim().min(1).optional(),
  publicSubtitle: z.string().trim().min(1).optional(),
  publicCity: z.string().trim().min(1).optional(),
  publicMeetingType: z.string().trim().min(1).optional(),
  publicAudience: z.string().trim().min(1).optional(),
  publicSortOrder: z.coerce.number().int().default(0),
  questionSetName: z.string().trim().min(1).default('general-screen'),
  generalQuestions: z.string().trim().default(''),
});

export const adminCreateDispatchProfileSchema = outboundDispatchProfileSeedSchema.extend({
  isActive: z.boolean().optional().default(true),
});

export const adminUpdateDispatchProfileSchema = outboundDispatchProfileSeedSchema
  .omit({ slug: true })
  .extend({
    isActive: z.boolean(),
  });

export function formatTimeLabel(iso: string, timezone: string): string {
  return DateTime.fromISO(iso).setZone(timezone).toFormat('ccc, LLL d · h:mm a');
}

function formatStampLabel(iso: string | null, timezone: string): string | null {
  if (!iso) {
    return null;
  }
  return DateTime.fromISO(iso).setZone(timezone).toFormat('LLL d · h:mm a');
}

export function buildBookingBaseUrl(config: OutboundRuntimeConfig): string {
  return `${config.appBaseUrl.replace(/\/+$/, '')}/bookings`;
}

export function buildInviteBaseUrl(config: OutboundRuntimeConfig): string {
  return `${config.appBaseUrl.replace(/\/+$/, '')}/invite`;
}

export function parseCandidateRows(raw: string): Array<{ fullName: string; email: string; phone: string }> {
  const rows = raw
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);

  if (rows.length === 0) {
    throw new Error('Add at least one candidate row.');
  }

  return rows.map((row, index) => {
    const columns = row.includes('\t')
      ? row.split('\t').map((column) => column.trim())
      : row.split(',').map((column) => column.trim());

    if (columns.length < 3) {
      throw new Error(
        `Candidate row ${index + 1} must be "Full Name, email, phone" or tab-separated.`,
      );
    }

    const [fullName, email, ...phoneParts] = columns;
    const phone = phoneParts.join(row.includes('\t') ? '\t' : ',').trim();

    if (!fullName || !email || !phone) {
      throw new Error(`Candidate row ${index + 1} is missing name, email, or phone.`);
    }

    return { fullName, email, phone };
  });
}

function parseBasicAuth(header: string | undefined): string | null {
  if (!header?.startsWith('Basic ')) {
    return null;
  }
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }
  return decoded.slice(separatorIndex + 1);
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = decodeURIComponent(part.slice(separatorIndex + 1).trim());
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function buildAdminSessionToken(config: OutboundRuntimeConfig): string {
  return createHash('sha256').update(config.adminApiKey).digest('hex');
}

export function requireAdmin(req: Request, res: Response, config: OutboundRuntimeConfig): boolean {
  const cookies = parseCookies(req.header('cookie'));
  if (cookies.__Host_wekruit_outbound_admin === buildAdminSessionToken(config)) {
    return true;
  }

  const password = parseBasicAuth(req.header('authorization'));
  if (password === config.adminApiKey) {
    res.setHeader(
      'Set-Cookie',
      `__Host_wekruit_outbound_admin=${buildAdminSessionToken(config)}; Path=/; HttpOnly; Secure; SameSite=Lax`,
    );
    return true;
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="WeKruit Outbound Admin"');
  res.status(401).json({ error: { message: 'Authentication required' } });
  return false;
}

export function jsonError(
  res: { status: (code: number) => { json: (payload: unknown) => unknown } },
  status: number,
  message: string,
) {
  res.status(status).json({ error: { message } });
}

export function routeSnapshotFromProfile(profile: OutboundDispatchProfile) {
  return {
    dispatchProfileSlug: profile.slug,
    dispatchProfileName: profile.name,
    routeSchool: profile.school ?? null,
    routeCampaign: profile.campaign ?? null,
    routePurpose: profile.purpose ?? null,
    routeTags: profile.tags,
    publicTitle: profile.publicTitle ?? null,
    publicSubtitle: profile.publicSubtitle ?? null,
    publicCity: profile.publicCity ?? null,
    publicMeetingType: profile.publicMeetingType ?? null,
    publicAudience: profile.publicAudience ?? null,
    publicSortOrder: profile.publicSortOrder ?? 0,
    retellAgentId: profile.retellAgentId,
    retellFromPhoneNumber: profile.retellFromPhoneNumber,
    googleCalendarSubject: profile.googleCalendarSubject,
    googleCalendarId: profile.googleCalendarId,
    bookingAccessMode: profile.bookingAccessMode,
    questionSetName: profile.questionSetName,
    generalQuestions: profile.generalQuestions || null,
  };
}

export function materializeProfileFromSnapshot(snapshot: {
  dispatchProfileSlug: string;
  dispatchProfileName: string;
  routeSchool: string | null;
  routeCampaign: string | null;
  routePurpose: string | null;
  routeTags: string[];
  publicTitle: string | null;
  publicSubtitle: string | null;
  publicCity: string | null;
  publicMeetingType: string | null;
  publicAudience: string | null;
  publicSortOrder: number;
  retellAgentId: string;
  retellFromPhoneNumber: string;
  googleCalendarSubject: string;
  googleCalendarId: string;
  bookingAccessMode?: 'public' | 'invite_only';
  questionSetName: string | null;
  generalQuestions: string | null;
  createdAt?: string;
  updatedAt?: string;
}): OutboundDispatchProfile {
  const stamp = snapshot.createdAt ?? snapshot.updatedAt ?? new Date().toISOString();
  return {
    id: snapshot.dispatchProfileSlug,
    slug: snapshot.dispatchProfileSlug,
    name: snapshot.dispatchProfileName,
    description: undefined,
    school: snapshot.routeSchool ?? undefined,
    campaign: snapshot.routeCampaign ?? undefined,
    purpose: snapshot.routePurpose ?? undefined,
    tags: snapshot.routeTags,
    publicTitle: snapshot.publicTitle ?? undefined,
    publicSubtitle: snapshot.publicSubtitle ?? undefined,
    publicCity: snapshot.publicCity ?? undefined,
    publicMeetingType: snapshot.publicMeetingType ?? undefined,
    publicAudience: snapshot.publicAudience ?? undefined,
    publicSortOrder: snapshot.publicSortOrder ?? 0,
    retellAgentId: snapshot.retellAgentId,
    retellFromPhoneNumber: snapshot.retellFromPhoneNumber,
    googleCalendarSubject: snapshot.googleCalendarSubject,
    googleCalendarId: snapshot.googleCalendarId,
    bookingAccessMode: snapshot.bookingAccessMode ?? 'invite_only',
    questionSetName: snapshot.questionSetName ?? 'general-screen',
    generalQuestions: snapshot.generalQuestions ?? '',
    isActive: true,
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function serializeDispatchProfile(profile: OutboundDispatchProfile) {
  return {
    id: profile.slug,
    slug: profile.slug,
    name: profile.name,
    description: profile.description ?? null,
    school: profile.school ?? null,
    campaign: profile.campaign ?? null,
    purpose: profile.purpose ?? null,
    tags: profile.tags,
    isActive: profile.isActive,
    bookingAccessMode: profile.bookingAccessMode,
    publicTitle: profile.publicTitle ?? null,
    publicSubtitle: profile.publicSubtitle ?? null,
    publicCity: profile.publicCity ?? null,
    publicMeetingType: profile.publicMeetingType ?? null,
    publicAudience: profile.publicAudience ?? null,
    publicSortOrder: profile.publicSortOrder ?? 0,
    questionSetName: profile.questionSetName,
    generalQuestions: profile.generalQuestions || null,
  };
}

export function serializeAdminDispatchProfile(
  config: OutboundRuntimeConfig,
  profile: OutboundDispatchProfile,
) {
  return {
    ...serializeDispatchProfile(profile),
    routeUrl:
      profile.bookingAccessMode === 'public'
        ? `${config.appBaseUrl.replace(/\/+$/, '')}/book/${profile.slug}`
        : null,
    retellAgentId: profile.retellAgentId,
    retellFromPhoneNumber: profile.retellFromPhoneNumber,
    googleCalendarSubject: profile.googleCalendarSubject,
    googleCalendarId: profile.googleCalendarId,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function serializeInviteWavePreviewRow(
  match: {
    rowId: string;
    status: 'matched' | 'ambiguous' | 'unmatched';
    explanation: string;
    suggestedProfileSlug: string | null;
    suggestedProfileName: string | null;
    matchedProfileSlugs: string[];
    candidate: {
      rowId: string;
      fullName: string;
      email: string;
      phone: string;
      school?: string;
      campaign?: string;
      purpose?: string;
      tags: string[];
    };
  },
  profilesBySlug: Map<string, OutboundDispatchProfile>,
) {
  return {
    rowId: match.rowId,
    status: match.status,
    explanation: match.explanation,
    suggestedProfileSlug: match.suggestedProfileSlug,
    suggestedProfileName: match.suggestedProfileName,
    selectedProfileSlug: match.suggestedProfileSlug,
    matchedProfiles: match.matchedProfileSlugs.map((slug) => ({
      slug,
      name: profilesBySlug.get(slug)?.name ?? slug,
    })),
    candidate: {
      rowId: match.candidate.rowId,
      fullName: match.candidate.fullName,
      email: match.candidate.email,
      phone: match.candidate.phone,
      school: match.candidate.school ?? null,
      campaign: match.candidate.campaign ?? null,
      purpose: match.candidate.purpose ?? null,
      tags: match.candidate.tags,
    },
  };
}

export function serializeAdminInvite(
  config: OutboundRuntimeConfig,
  timezone: string,
  entry: OutboundAdminSchedulingInviteDetails,
) {
  return {
    id: entry.invite.id,
    status: entry.invite.status,
    batchLabel: entry.invite.batchLabel,
    inviteToken: entry.invite.inviteToken,
    inviteUrl: `${buildInviteBaseUrl(config)}/${entry.invite.inviteToken}`,
    sentAt: entry.invite.sentAt,
    sentAtLabel: formatStampLabel(entry.invite.sentAt, timezone),
    bookedAt: entry.invite.bookedAt,
    bookedAtLabel: formatStampLabel(entry.invite.bookedAt, timezone),
    bookingId: entry.invite.bookingId,
    bookingStartsAt: entry.booking?.startsAt ?? null,
    bookingStartsAtLabel: entry.booking ? formatTimeLabel(entry.booking.startsAt, timezone) : null,
    profile: {
      slug: entry.invite.dispatchProfileSlug,
      name: entry.invite.dispatchProfileName,
      school: entry.invite.routeSchool,
      campaign: entry.invite.routeCampaign,
      purpose: entry.invite.routePurpose,
      tags: entry.invite.routeTags,
      retellAgentId: entry.invite.retellAgentId,
      retellFromPhoneNumber: entry.invite.retellFromPhoneNumber,
      googleCalendarSubject: entry.invite.googleCalendarSubject,
      googleCalendarId: entry.invite.googleCalendarId,
      questionSetName: entry.invite.questionSetName,
      generalQuestions: entry.invite.generalQuestions,
    },
    candidate: {
      id: entry.candidate.id,
      fullName: entry.candidate.fullName,
      email: entry.candidate.email,
      phone: entry.candidate.phone,
    },
  };
}

export function serializeAdminBooking(
  timezone: string,
  entry: OutboundAdminBookingDetails,
) {
  return {
    id: entry.booking.id,
    status: entry.booking.status,
    startsAt: entry.booking.startsAt,
    startsAtLabel: formatTimeLabel(entry.booking.startsAt, timezone),
    endsAt: entry.booking.endsAt,
    timezone: entry.booking.timezone,
    inviteSentAt: entry.booking.inviteSentAt,
    inviteSentAtLabel: formatStampLabel(entry.booking.inviteSentAt, timezone),
    reminderSentAt: entry.booking.reminderSentAt,
    reminderSentAtLabel: formatStampLabel(entry.booking.reminderSentAt, timezone),
    retellCallId: entry.booking.retellCallId,
    retellAgentId: entry.booking.retellAgentId,
    retellFromPhoneNumber: entry.booking.retellFromPhoneNumber,
    googleCalendarSubject: entry.booking.googleCalendarSubject,
    googleCalendarId: entry.booking.googleCalendarId,
    calendarEventId: entry.booking.calendarEventId,
    questionSetName: entry.booking.questionSetName,
    generalQuestions: entry.booking.generalQuestions,
    profile: {
      slug: entry.booking.dispatchProfileSlug,
      name: entry.booking.dispatchProfileName,
      school: entry.booking.routeSchool,
      campaign: entry.booking.routeCampaign,
      purpose: entry.booking.routePurpose,
      tags: entry.booking.routeTags,
      publicTitle: entry.booking.publicTitle,
      publicSubtitle: entry.booking.publicSubtitle,
      publicCity: entry.booking.publicCity,
      publicMeetingType: entry.booking.publicMeetingType,
      publicAudience: entry.booking.publicAudience,
    },
    candidate: {
      id: entry.candidate.id,
      fullName: entry.candidate.fullName,
      email: entry.candidate.email,
      phone: entry.candidate.phone,
    },
    artifact: entry.artifact
      ? {
          callStatus: entry.artifact.callStatus,
          recordingUrl: entry.artifact.recordingUrl,
          recordingMultiChannelUrl: entry.artifact.recordingMultiChannelUrl,
          transcriptPreview: entry.artifact.transcript?.slice(0, 160) ?? null,
          transcript: entry.artifact.transcript,
        }
      : null,
  };
}

export function serializeBookingDetails(timezone: string, entry: OutboundBookingDetails) {
  return {
    id: entry.booking.id,
    status: entry.booking.status,
    startsAt: entry.booking.startsAt,
    startsAtLabel: formatTimeLabel(entry.booking.startsAt, timezone),
    endsAt: entry.booking.endsAt,
    timezone: entry.booking.timezone,
    questionSetName: entry.booking.questionSetName,
    generalQuestions: entry.booking.generalQuestions,
    inviteSentAt: entry.booking.inviteSentAt,
    inviteSentAtLabel: formatStampLabel(entry.booking.inviteSentAt, timezone),
    reminderSentAt: entry.booking.reminderSentAt,
    reminderSentAtLabel: formatStampLabel(entry.booking.reminderSentAt, timezone),
    retellCallId: entry.booking.retellCallId,
    profile: {
      slug: entry.booking.dispatchProfileSlug,
      name: entry.booking.dispatchProfileName,
      school: entry.booking.routeSchool,
      campaign: entry.booking.routeCampaign,
      purpose: entry.booking.routePurpose,
      tags: entry.booking.routeTags,
      publicTitle: entry.booking.publicTitle,
      publicSubtitle: entry.booking.publicSubtitle,
      publicCity: entry.booking.publicCity,
      publicMeetingType: entry.booking.publicMeetingType,
      publicAudience: entry.booking.publicAudience,
    },
    candidate: {
      id: entry.candidate.id,
      fullName: entry.candidate.fullName,
      email: entry.candidate.email,
      phone: entry.candidate.phone,
    },
  };
}

export async function verifyRetellWebhookSignature(
  body: string,
  apiKey: string,
  signature: string,
): Promise<boolean> {
  const match = /v=(\d+),d=(.*)/.exec(signature);
  if (!match) {
    return false;
  }

  const timestamp = Number(match[1]);
  const digest = match[2];
  const now = Date.now();
  const timeoutMs = 5 * 60 * 1000;

  if (Math.abs(now - timestamp) > timeoutMs) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(apiKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const digestBytes = new Uint8Array(digest.length / 2);
  for (let index = 0; index < digest.length; index += 2) {
    digestBytes[index / 2] = Number.parseInt(digest.slice(index, index + 2), 16);
  }

  return globalThis.crypto.subtle.verify(
    'HMAC',
    key,
    digestBytes,
    encoder.encode(body + timestamp),
  );
}

export function normalizeDispatchProfileCreateInput(
  input: z.infer<typeof adminCreateDispatchProfileSchema>,
  now = new Date().toISOString(),
): OutboundDispatchProfile {
  return {
    id: input.slug,
    ...input,
    createdAt: now,
    updatedAt: now,
  };
}

export function normalizeDispatchProfileUpdateInput(
  slug: string,
  input: z.infer<typeof adminUpdateDispatchProfileSchema>,
  existing: OutboundDispatchProfile,
  now = new Date().toISOString(),
): OutboundDispatchProfile {
  return {
    ...existing,
    slug,
    ...input,
    updatedAt: now,
  };
}

export type OutboundReviewedInviteWaveRow = z.infer<typeof reviewedInviteWaveRowSchema>;
export type OutboundAdminCreateDispatchProfileInput = z.infer<typeof adminCreateDispatchProfileSchema>;
export type OutboundAdminUpdateDispatchProfileInput = z.infer<typeof adminUpdateDispatchProfileSchema>;
export type OutboundDispatchProfileSeedInput = OutboundDispatchProfileSeed;
export type OutboundInviteSnapshot = OutboundSchedulingInviteRecord;
