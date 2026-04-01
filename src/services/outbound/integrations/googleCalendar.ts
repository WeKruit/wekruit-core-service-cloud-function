import { DateTime } from 'luxon';
import { google } from 'googleapis';

import type { OutboundAvailableSlot, OutboundCalendarService } from '../application/contracts';
import type { OutboundRuntimeConfig } from '../application/runtime';
import type { OutboundDispatchProfile } from '../domain/dispatch-profile';

interface BusyWindow {
  start: DateTime;
  end: DateTime;
}

export class OutboundGoogleCalendarService implements OutboundCalendarService {
  constructor(private readonly config: OutboundRuntimeConfig) {}

  private createCalendarClient(profile: OutboundDispatchProfile) {
    const authClient = new google.auth.JWT({
      email: this.config.googleServiceAccountEmail,
      key: this.config.googleServiceAccountPrivateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: profile.googleCalendarSubject,
    });

    return google.calendar({
      version: 'v3',
      auth: authClient,
    });
  }

  private async listSlotsFromRangeStart(
    profile: OutboundDispatchProfile,
    rangeStart: DateTime,
  ): Promise<OutboundAvailableSlot[]> {
    const calendar = this.createCalendarClient(profile);
    const timezone = this.config.appTimezone;
    const rangeEnd = rangeStart.plus({ days: this.config.bookingHorizonDays }).endOf('day');

    const freeBusyResponse = await calendar.freebusy.query({
      requestBody: {
        timeMin: rangeStart.toUTC().toISO(),
        timeMax: rangeEnd.toUTC().toISO(),
        timeZone: timezone,
        items: [{ id: profile.googleCalendarId }],
      },
    });

    const busy: BusyWindow[] =
      freeBusyResponse.data.calendars?.[profile.googleCalendarId]?.busy?.map((window) => ({
        start: DateTime.fromISO(String(window.start), { zone: timezone }),
        end: DateTime.fromISO(String(window.end), { zone: timezone }),
      })) ?? [];

    const slots: OutboundAvailableSlot[] = [];
    let cursor = rangeStart.startOf('day');

    while (cursor <= rangeEnd) {
      let slotStart = cursor.set({
        hour: this.config.bookingWorkdayStartHour,
        minute: 0,
        second: 0,
        millisecond: 0,
      });
      const dayEnd = cursor.set({
        hour: this.config.bookingWorkdayEndHour,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      while (slotStart.plus({ minutes: this.config.bookingSlotMinutes }) <= dayEnd) {
        const slotEnd = slotStart.plus({ minutes: this.config.bookingSlotMinutes });
        const isInFuture = slotStart >= rangeStart;
        const overlapsBusy = busy.some(
          (window) => slotStart < window.end && slotEnd > window.start,
        );

        if (isInFuture && !overlapsBusy) {
          slots.push({
            startIso: slotStart.toUTC().toISO() ?? '',
            endIso: slotEnd.toUTC().toISO() ?? '',
            label: slotStart.toFormat("ccc, LLL d 'at' h:mm a"),
          });
        }

        slotStart = slotEnd;
      }

      cursor = cursor.plus({ days: 1 });
    }

    return slots;
  }

  async listAvailableSlots(profile: OutboundDispatchProfile): Promise<OutboundAvailableSlot[]> {
    const now = DateTime.now()
      .setZone(this.config.appTimezone)
      .plus({ hours: this.config.bookingLeadHours });
    return this.listSlotsFromRangeStart(profile, now.startOf('hour'));
  }

  async findTestSlotAtOrAfter(
    profile: OutboundDispatchProfile,
    targetIso: string,
  ): Promise<OutboundAvailableSlot | null> {
    const target = DateTime.fromISO(targetIso, { zone: this.config.appTimezone });
    if (!target.isValid) {
      return null;
    }

    const slots = await this.listSlotsFromRangeStart(profile, target.startOf('hour'));
    return (
      slots.find((slot) => DateTime.fromISO(slot.startIso).toMillis() >= target.toUTC().toMillis()) ??
      null
    );
  }

  async createInterviewEvent(input: {
    profile: OutboundDispatchProfile;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<{ eventId: string | null }> {
    const calendar = this.createCalendarClient(input.profile);
    const response = await calendar.events.insert({
      calendarId: input.profile.googleCalendarId,
      sendUpdates: 'none',
      requestBody: {
        summary: `${input.profile.name}: ${input.candidateName}`,
        description: [
          `Dispatch Profile: ${input.profile.name}`,
          `Candidate: ${input.candidateName}`,
          `Email: ${input.candidateEmail}`,
          `Phone: ${input.candidatePhone}`,
          `Question Set: ${input.questionSetName ?? 'general-screen'}`,
          '',
          input.generalQuestions ? `General Questions:\n${input.generalQuestions}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        location: `Phone call to ${input.candidatePhone}`,
        attendees: [{ email: input.candidateEmail, displayName: input.candidateName }],
        start: {
          dateTime: input.startsAt,
          timeZone: input.timezone,
        },
        end: {
          dateTime: input.endsAt,
          timeZone: input.timezone,
        },
        reminders: {
          useDefault: false,
        },
      },
    });

    return {
      eventId: response.data.id ?? null,
    };
  }
}
