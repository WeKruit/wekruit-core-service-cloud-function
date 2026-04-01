import cors from 'cors';
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { DateTime } from 'luxon';
import { z } from 'zod';

import { outboundSecrets } from '../../../../bootstrap/secrets';
import {
  adminCreateDispatchProfileSchema,
  adminInviteRequestSchema,
  adminInviteWavePreviewSchema,
  adminInviteWaveSendSchema,
  adminTestCallRequestSchema,
  adminUpdateDispatchProfileSchema,
  bookingRequestSchema,
  buildBookingBaseUrl,
  buildInviteBaseUrl,
  formatTimeLabel,
  jsonError,
  materializeProfileFromSnapshot,
  parseCandidateRows,
  requireAdmin,
  routeSnapshotFromProfile,
  serializeAdminBooking,
  serializeAdminDispatchProfile,
  serializeAdminInvite,
  serializeBookingDetails,
  serializeDispatchProfile,
  serializeInviteWavePreviewRow,
} from '../../application/http';
import { previewOutboundCandidateWaveMatches, parseOutboundCandidateWaveRows } from '../../application/matchingEngine';
import { getOutboundRuntimeConfig } from '../../application/runtime';
import { OutboundTaskScheduler } from '../../application/taskScheduler';
import { OutboundGoogleCalendarService } from '../../integrations/googleCalendar';
import { OutboundMailgunService } from '../../integrations/mailgun';
import { OutboundRetellService } from '../../integrations/retell';
import { OutboundBookingRepository } from '../../repositories/bookingRepository';
import { OutboundDispatchProfileRepository } from '../../repositories/dispatchProfileRepository';

const app = express();
app.use(cors({ origin: true }));
app.use(
  express.json({
    verify: (request, _response, buffer) => {
      (request as express.Request & { rawBody?: string }).rawBody = buffer.toString('utf8');
    },
  }),
);

const dispatchProfileRepository = new OutboundDispatchProfileRepository();
const bookingRepository = new OutboundBookingRepository();
const taskScheduler = new OutboundTaskScheduler();

function getServices() {
  const config = getOutboundRuntimeConfig();
  return {
    config,
    calendarService: new OutboundGoogleCalendarService(config),
    mailerService: new OutboundMailgunService(config),
    retellService: new OutboundRetellService(config),
  };
}

async function createBookingForProfile(input: {
  profile: Awaited<ReturnType<OutboundDispatchProfileRepository['getActivePublicProfileBySlug']>> extends infer T
    ? Exclude<T, null>
    : never;
  bookingRequest: z.infer<typeof bookingRequestSchema>;
  inviteId?: string;
}) {
  const { config, calendarService, mailerService } = getServices();

  const selectedSlot = (await calendarService.listAvailableSlots(input.profile)).find(
    (slot) => slot.startIso === input.bookingRequest.slotStart,
  );

  if (!selectedSlot) {
    return {
      ok: false as const,
      errorMessage: 'That time is no longer available. Pick another slot.',
    };
  }

  const candidate = await bookingRepository.upsertCandidate({
    fullName: input.bookingRequest.fullName,
    email: input.bookingRequest.email,
    phone: input.bookingRequest.phone,
  });

  const calendarEvent = await calendarService.createInterviewEvent({
    profile: input.profile,
    candidateName: candidate.fullName,
    candidateEmail: candidate.email,
    candidatePhone: candidate.phone,
    startsAt: selectedSlot.startIso,
    endsAt: selectedSlot.endIso,
    timezone: config.appTimezone,
    questionSetName: input.profile.questionSetName,
    generalQuestions: input.profile.generalQuestions || null,
  });

  const booking = await bookingRepository.createBooking({
    candidateId: candidate.id,
    candidateFullName: candidate.fullName,
    candidateEmail: candidate.email,
    candidatePhone: candidate.phone,
    startsAt: selectedSlot.startIso,
    endsAt: selectedSlot.endIso,
    timezone: config.appTimezone,
    dispatchProfileSlug: input.profile.slug,
    dispatchProfileName: input.profile.name,
    routeSchool: input.profile.school ?? null,
    routeCampaign: input.profile.campaign ?? null,
    routePurpose: input.profile.purpose ?? null,
    routeTags: input.profile.tags,
    publicTitle: input.profile.publicTitle ?? null,
    publicSubtitle: input.profile.publicSubtitle ?? null,
    publicCity: input.profile.publicCity ?? null,
    publicMeetingType: input.profile.publicMeetingType ?? null,
    publicAudience: input.profile.publicAudience ?? null,
    publicSortOrder: input.profile.publicSortOrder ?? 0,
    retellAgentId: input.profile.retellAgentId,
    retellFromPhoneNumber: input.profile.retellFromPhoneNumber,
    googleCalendarSubject: input.profile.googleCalendarSubject,
    googleCalendarId: input.profile.googleCalendarId,
    questionSetName: input.profile.questionSetName,
    generalQuestions: input.profile.generalQuestions || null,
    calendarEventId: calendarEvent.eventId ?? null,
  });

  await mailerService.sendBookingConfirmation({
    bookingId: booking.id,
    bookingBaseUrl: buildBookingBaseUrl(config),
    dispatchProfileName: booking.dispatchProfileName,
    candidateName: candidate.fullName,
    candidateEmail: candidate.email,
    candidatePhone: candidate.phone,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timezone: booking.timezone,
    questionSetName: booking.questionSetName,
    generalQuestions: booking.generalQuestions,
  });

  const now = new Date().toISOString();
  await bookingRepository.markInviteSent(booking.id, now);

  if (input.inviteId) {
    await bookingRepository.attachBookingToSchedulingInvite(input.inviteId, booking.id, now);
  }

  await taskScheduler.scheduleForBooking(booking, config.bookingReminderHours);

  return {
    ok: true as const,
    bookingId: booking.id,
  };
}

async function createInternalTestBookingForProfile(input: {
  profile: Awaited<ReturnType<OutboundDispatchProfileRepository['getActiveProfileBySlug']>> extends infer T
    ? Exclude<T, null>
    : never;
  bookingRequest: {
    fullName: string;
    email: string;
    phone: string;
    slotStart: string;
  };
}) {
  const { config, calendarService, mailerService } = getServices();
  const startsAt = DateTime.fromISO(input.bookingRequest.slotStart, { zone: 'utc' });
  if (!startsAt.isValid) {
    return {
      ok: false as const,
      errorMessage: 'That time is no longer available. Pick another slot.',
    };
  }

  const endsAt = startsAt.plus({ minutes: config.bookingSlotMinutes });

  const candidate = await bookingRepository.upsertCandidate({
    fullName: input.bookingRequest.fullName,
    email: input.bookingRequest.email,
    phone: input.bookingRequest.phone,
  });

  const calendarEvent = await calendarService.createInterviewEvent({
    profile: input.profile,
    candidateName: candidate.fullName,
    candidateEmail: candidate.email,
    candidatePhone: candidate.phone,
    startsAt: startsAt.toUTC().toISO() ?? input.bookingRequest.slotStart,
    endsAt: endsAt.toUTC().toISO() ?? endsAt.toISO() ?? input.bookingRequest.slotStart,
    timezone: config.appTimezone,
    questionSetName: input.profile.questionSetName,
    generalQuestions: input.profile.generalQuestions || null,
  });

  const booking = await bookingRepository.createBooking({
    candidateId: candidate.id,
    candidateFullName: candidate.fullName,
    candidateEmail: candidate.email,
    candidatePhone: candidate.phone,
    startsAt: startsAt.toUTC().toISO() ?? input.bookingRequest.slotStart,
    endsAt: endsAt.toUTC().toISO() ?? endsAt.toISO() ?? input.bookingRequest.slotStart,
    timezone: config.appTimezone,
    dispatchProfileSlug: input.profile.slug,
    dispatchProfileName: input.profile.name,
    routeSchool: input.profile.school ?? null,
    routeCampaign: input.profile.campaign ?? null,
    routePurpose: input.profile.purpose ?? null,
    routeTags: input.profile.tags,
    publicTitle: input.profile.publicTitle ?? null,
    publicSubtitle: input.profile.publicSubtitle ?? null,
    publicCity: input.profile.publicCity ?? null,
    publicMeetingType: input.profile.publicMeetingType ?? null,
    publicAudience: input.profile.publicAudience ?? null,
    publicSortOrder: input.profile.publicSortOrder ?? 0,
    retellAgentId: input.profile.retellAgentId,
    retellFromPhoneNumber: input.profile.retellFromPhoneNumber,
    googleCalendarSubject: input.profile.googleCalendarSubject,
    googleCalendarId: input.profile.googleCalendarId,
    questionSetName: input.profile.questionSetName,
    generalQuestions: input.profile.generalQuestions || null,
    calendarEventId: calendarEvent.eventId ?? null,
  });

  const now = new Date().toISOString();
  await mailerService.sendBookingConfirmation({
    bookingId: booking.id,
    bookingBaseUrl: buildBookingBaseUrl(config),
    dispatchProfileName: booking.dispatchProfileName,
    candidateName: candidate.fullName,
    candidateEmail: candidate.email,
    candidatePhone: candidate.phone,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timezone: booking.timezone,
    questionSetName: booking.questionSetName,
    generalQuestions: booking.generalQuestions,
  });

  await bookingRepository.markInviteSent(booking.id, now);
  await taskScheduler.scheduleForBooking(booking, config.bookingReminderHours);

  return {
    ok: true as const,
    bookingId: booking.id,
  };
}

app.get('/health', (_req, res) => {
  sendHealth(res);
});

function sendHealth(res: express.Response) {
  res.status(200).json({
    ok: true,
    service: 'outbound',
    runtime: 'firebase-functions',
  });
}

app.get('/api/admin/dispatch-profiles', async (req, res, next) => {
  try {
    const { config } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const profiles = await dispatchProfileRepository.listProfiles();
    const data = profiles.map((profile) => serializeAdminDispatchProfile(config, profile));
    res.json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/dispatch-profiles', async (req, res, next) => {
  try {
    const { config } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const parsed = adminCreateDispatchProfileSchema.parse(req.body);
    const profile = await dispatchProfileRepository.createProfile(parsed);
    res.status(201).json({
      data: serializeAdminDispatchProfile(config, profile),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      jsonError(res, 422, error.message);
      return;
    }
    if (error instanceof Error && error.message.includes('already exists')) {
      jsonError(res, 409, error.message);
      return;
    }
    next(error);
  }
});

app.put('/api/admin/dispatch-profiles/:slug', async (req, res, next) => {
  try {
    const { config } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const existing = await dispatchProfileRepository.getProfileBySlug(req.params.slug);
    if (!existing) {
      jsonError(res, 404, 'Dispatch profile not found.');
      return;
    }

    const parsed = adminUpdateDispatchProfileSchema.parse(req.body);
    const profile = await dispatchProfileRepository.updateProfile({
      slug: req.params.slug,
      ...parsed,
    });
    res.json({
      data: serializeAdminDispatchProfile(config, profile),
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.get('/api/admin/retell/agents', async (req, res, next) => {
  try {
    const { config, retellService } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const data = await retellService.listVoiceAgents();
    res.json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/retell/phone-numbers', async (req, res, next) => {
  try {
    const { config, retellService } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const data = await retellService.listPhoneNumbers();
    res.json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/scheduling-invites', async (req, res, next) => {
  try {
    const { config } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const entries = await bookingRepository.listAdminSchedulingInvites();
    const data = entries.map((entry) => serializeAdminInvite(config, config.appTimezone, entry));
    res.json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/invite-waves/preview', async (req, res, next) => {
  try {
    const { config } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const parsed = adminInviteWavePreviewSchema.parse(req.body);
    const profiles = await dispatchProfileRepository.listActiveProfiles();
    const profileMap = new Map(profiles.map((profile) => [profile.slug, profile]));
    const rows = parseOutboundCandidateWaveRows(parsed.candidates);
    const matches = previewOutboundCandidateWaveMatches(rows, profiles);
    const summary = matches.reduce(
      (accumulator, match) => {
        accumulator.total += 1;
        accumulator[match.status] += 1;
        return accumulator;
      },
      {
        total: 0,
        matched: 0,
        ambiguous: 0,
        unmatched: 0,
      },
    );

    res.json({
      data: {
        batchLabel: parsed.batchLabel || null,
        summary,
        rows: matches.map((match) => serializeInviteWavePreviewRow(match, profileMap)),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.get('/api/admin/bookings', async (req, res, next) => {
  try {
    const { config } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const entries = await bookingRepository.listAdminBookings();
    const data = entries.map((entry) => serializeAdminBooking(config.appTimezone, entry));
    res.json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/invite-waves/send', async (req, res, next) => {
  try {
    const { config, mailerService } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const parsed = adminInviteWaveSendSchema.parse(req.body);
    const createdInviteIds: string[] = [];
    const waveSentAt = new Date().toISOString();

    for (const row of parsed.rows) {
      const profile = await dispatchProfileRepository.getActiveProfileBySlug(row.selectedProfileSlug);
      if (!profile) {
        jsonError(
          res,
          422,
          `Dispatch profile "${row.selectedProfileSlug}" is not active or no longer exists.`,
        );
        return;
      }

      const candidate = await bookingRepository.upsertCandidate({
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
      });

      const invite = await bookingRepository.createOrRefreshSchedulingInvite({
        candidateId: candidate.id,
        candidateFullName: candidate.fullName,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        ...routeSnapshotFromProfile(profile),
        batchLabel: parsed.batchLabel || null,
        now: waveSentAt,
      });

      await mailerService.sendSchedulingInvite({
        inviteId: invite.id,
        inviteUrl: `${buildInviteBaseUrl(config)}/${invite.inviteToken}`,
        dispatchProfileName: profile.name,
        batchLabel: invite.batchLabel,
        candidateName: candidate.fullName,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        questionSetName: profile.questionSetName,
        generalQuestions: profile.generalQuestions || null,
      });

      createdInviteIds.push(invite.id);
    }

    res.status(201).json({
      data: {
        id: crypto.randomUUID(),
        sentCount: parsed.rows.length,
        inviteIds: createdInviteIds,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.post('/api/admin/scheduling-invites', async (req, res, next) => {
  try {
    const { config, mailerService } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const parsed = adminInviteRequestSchema.parse(req.body);
    const profile = await dispatchProfileRepository.getActiveProfileBySlug(parsed.profileSlug);
    if (!profile) {
      jsonError(res, 404, 'Dispatch profile not found.');
      return;
    }

    const candidateRows = parseCandidateRows(parsed.candidates);
    const createdInviteIds: string[] = [];

    for (const candidateRow of candidateRows) {
      const candidate = await bookingRepository.upsertCandidate(candidateRow);
      const invite = await bookingRepository.createOrRefreshSchedulingInvite({
        candidateId: candidate.id,
        candidateFullName: candidate.fullName,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        ...routeSnapshotFromProfile(profile),
        batchLabel: parsed.batchLabel || null,
      });

      await mailerService.sendSchedulingInvite({
        inviteId: invite.id,
        inviteUrl: `${buildInviteBaseUrl(config)}/${invite.inviteToken}`,
        dispatchProfileName: profile.name,
        batchLabel: invite.batchLabel,
        candidateName: candidate.fullName,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        questionSetName: profile.questionSetName,
        generalQuestions: profile.generalQuestions || null,
      });

      createdInviteIds.push(invite.id);
    }

    res.status(201).json({
      data: {
        id: crypto.randomUUID(),
        sentCount: candidateRows.length,
        inviteIds: createdInviteIds,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.post('/api/admin/test-bookings', async (req, res, next) => {
  try {
    const { config } = getServices();
    if (!requireAdmin(req, res, config)) {
      return;
    }

    const parsed = adminTestCallRequestSchema.parse(req.body);
    const profile = await dispatchProfileRepository.getActiveProfileBySlug(parsed.profileSlug);
    if (!profile) {
      jsonError(res, 404, 'Dispatch profile not found.');
      return;
    }

    const targetStart = DateTime.now()
      .setZone(config.appTimezone)
      .plus({ minutes: parsed.offsetMinutes })
      .startOf('minute');
    const targetIso = targetStart.toUTC().toISO();
    if (!targetIso) {
      jsonError(res, 422, 'Could not compute a valid test call time.');
      return;
    }

    const result = await createInternalTestBookingForProfile({
      profile,
      bookingRequest: {
        fullName: parsed.fullName,
        email: parsed.email,
        phone: parsed.phone,
        slotStart: targetIso,
      },
    });

    if (!result.ok) {
      jsonError(res, 409, result.errorMessage);
      return;
    }

    const booking = await bookingRepository.getBookingDetails(result.bookingId);
    if (!booking) {
      jsonError(res, 500, 'Test booking was created but could not be loaded.');
      return;
    }

    res.status(201).json({
      data: {
        id: booking.booking.id,
        startsAt: booking.booking.startsAt,
        startsAtLabel: formatTimeLabel(booking.booking.startsAt, config.appTimezone),
        redirectTo: `/bookings/${booking.booking.id}/confirmed`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.get('/api/public/dispatch-profiles', async (_req, res, next) => {
  try {
    const { config } = getServices();
    const profiles = await dispatchProfileRepository.listActivePublicProfiles();
    const data = profiles.map(serializeDispatchProfile);
    res.json({
      data,
      total: data.length,
      timezone: config.appTimezone,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/public/dispatch-profiles/:profileSlug/slots', async (req, res, next) => {
  try {
    const { config, calendarService } = getServices();
    const profile = await dispatchProfileRepository.getActivePublicProfileBySlug(req.params.profileSlug);
    if (!profile) {
      jsonError(res, 404, 'Booking profile not found.');
      return;
    }

    const slots = await calendarService.listAvailableSlots(profile);
    res.json({
      data: {
        profile: serializeDispatchProfile(profile),
        timezone: config.appTimezone,
        slots,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/public/invites/:inviteToken', async (req, res, next) => {
  try {
    const { config, calendarService } = getServices();
    const invite = await bookingRepository.getSchedulingInviteDetailsByToken(req.params.inviteToken);
    if (!invite) {
      jsonError(res, 404, 'Scheduling invite not found.');
      return;
    }

    const profile = materializeProfileFromSnapshot(invite.invite);
    const slots = invite.booking ? [] : await calendarService.listAvailableSlots(profile);

    res.json({
      data: {
        invite: {
          id: invite.invite.id,
          status: invite.invite.status,
          batchLabel: invite.invite.batchLabel,
          inviteToken: invite.invite.inviteToken,
          bookingId: invite.booking?.id ?? null,
          redirectTo: invite.booking ? `/bookings/${invite.booking.id}/confirmed` : null,
        },
        candidate: {
          id: invite.candidate.id,
          fullName: invite.candidate.fullName,
          email: invite.candidate.email,
          phone: invite.candidate.phone,
        },
        profile: serializeDispatchProfile(profile),
        timezone: config.appTimezone,
        slots,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/public/dispatch-profiles/:profileSlug/bookings', async (req, res, next) => {
  try {
    const profile = await dispatchProfileRepository.getActivePublicProfileBySlug(req.params.profileSlug);
    if (!profile) {
      jsonError(res, 404, 'Booking profile not found.');
      return;
    }

    const parsed = bookingRequestSchema.parse(req.body);
    const result = await createBookingForProfile({
      profile,
      bookingRequest: parsed,
    });

    if (!result.ok) {
      jsonError(res, 409, result.errorMessage);
      return;
    }

    res.status(201).json({
      data: {
        id: result.bookingId,
        redirectTo: `/bookings/${result.bookingId}/confirmed`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.post('/api/public/invites/:inviteToken/bookings', async (req, res, next) => {
  try {
    const invite = await bookingRepository.getSchedulingInviteDetailsByToken(req.params.inviteToken);
    if (!invite) {
      jsonError(res, 404, 'Scheduling invite not found.');
      return;
    }

    if (invite.booking) {
      res.status(200).json({
        data: {
          id: invite.booking.id,
          redirectTo: `/bookings/${invite.booking.id}/confirmed`,
        },
      });
      return;
    }

    const profile = materializeProfileFromSnapshot(invite.invite);
    const parsed = bookingRequestSchema.parse(req.body);
    const result = await createBookingForProfile({
      profile,
      bookingRequest: parsed,
      inviteId: invite.invite.id,
    });

    if (!result.ok) {
      jsonError(res, 409, result.errorMessage);
      return;
    }

    res.status(201).json({
      data: {
        id: result.bookingId,
        redirectTo: `/bookings/${result.bookingId}/confirmed`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.get('/api/public/bookings/:bookingId', async (req, res, next) => {
  try {
    const { config } = getServices();
    const booking = await bookingRepository.getBookingDetails(req.params.bookingId);
    if (!booking) {
      jsonError(res, 404, 'Booking not found.');
      return;
    }

    res.json({
      data: {
        booking: serializeBookingDetails(config.appTimezone, booking),
        timezone: config.appTimezone,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Internal server error';
  jsonError(res, 500, message);
});

export const outboundApi = onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    secrets: outboundSecrets,
  },
  app,
);
