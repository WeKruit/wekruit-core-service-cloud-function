import { DateTime } from 'luxon';

import type { OutboundMailerService } from '../application/contracts';
import type { OutboundRuntimeConfig } from '../application/runtime';

function buildCalendarAttachment(input: {
  bookingId: string;
  bookingBaseUrl: string;
  dispatchProfileName: string;
  candidateName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  questionSetName: string | null;
  generalQuestions: string | null;
}): string {
  const startsAt = DateTime.fromISO(input.startsAt).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  const endsAt = DateTime.fromISO(input.endsAt).toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  const description = [
    `${input.dispatchProfileName} phone interview for ${input.candidateName}.`,
    `Question set: ${input.questionSetName ?? 'general-screen'}.`,
    input.generalQuestions ? `Questions:\n${input.generalQuestions}` : null,
    `Manage booking: ${input.bookingBaseUrl}/${input.bookingId}/confirmed`,
  ]
    .filter(Boolean)
    .join('\\n')
    .replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//WeKruit//Outbound Interview//EN',
    'BEGIN:VEVENT',
    `UID:${input.bookingId}@wekruit.ai`,
    `DTSTAMP:${DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'")}`,
    `DTSTART:${startsAt}`,
    `DTEND:${endsAt}`,
    'SUMMARY:WeKruit AI Phone Interview',
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

async function sendMail(
  config: OutboundRuntimeConfig,
  input: {
    to: string;
    subject: string;
    html: string;
    ics?: string;
  },
): Promise<void> {
  const form = new FormData();
  form.set('from', config.mailgunFromEmail ?? `WeKruit <hi@${config.mailgunDomain}>`);
  form.set('to', input.to);
  form.set('subject', input.subject);
  form.set('html', input.html);

  if (input.ics) {
    form.append(
      'attachment',
      new Blob([input.ics], { type: 'text/calendar; charset=utf-8' }),
      'interview-invite.ics',
    );
  }

  const response = await fetch(`https://api.mailgun.net/v3/${config.mailgunDomain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${config.mailgunApiKey}`).toString('base64')}`,
    },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Mailgun request failed (${response.status}): ${await response.text()}`);
  }
}

export class OutboundMailgunService implements OutboundMailerService {
  constructor(private readonly config: OutboundRuntimeConfig) {}

  async sendSchedulingInvite(input: {
    inviteId: string;
    inviteUrl: string;
    dispatchProfileName: string;
    batchLabel: string | null;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<void> {
    await sendMail(this.config, {
      to: input.candidateEmail,
      subject: `${input.dispatchProfileName}: choose your interview time`,
      html: `
        <p>Hi ${input.candidateName},</p>
        <p>We would like to schedule your <strong>${input.dispatchProfileName}</strong> AI phone interview.</p>
        ${
          input.batchLabel
            ? `<p>This invitation is part of <strong>${input.batchLabel}</strong>.</p>`
            : ''
        }
        <p>Please choose a time that works for you on the WeKruit booking page first:</p>
        <p><a href="${input.inviteUrl}">${input.inviteUrl}</a></p>
        <p>This email is only the scheduling link. After you book, we will send the calendar confirmation separately.</p>
        <p>We will call <strong>${input.candidatePhone}</strong> at the scheduled time you choose there.</p>
        <p>Question set: <strong>${input.questionSetName ?? 'general-screen'}</strong>.</p>
        ${
          input.generalQuestions
            ? `<p>General questions we have configured:</p><pre>${input.generalQuestions}</pre>`
            : ''
        }
        <p>If you need a different callback number, you can update it when you book.</p>
      `,
    });
  }

  async sendBookingConfirmation(input: {
    bookingId: string;
    bookingBaseUrl: string;
    dispatchProfileName: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<void> {
    const startsAt = DateTime.fromISO(input.startsAt).setZone(input.timezone);
    const humanTime = startsAt.toFormat('cccc, LLL d, yyyy h:mm a ZZZZ');
    const ics = buildCalendarAttachment(input);

    await sendMail(this.config, {
      to: input.candidateEmail,
      subject: `${input.dispatchProfileName} interview booked`,
      html: `
        <p>Hi ${input.candidateName},</p>
        <p>Your <strong>${input.dispatchProfileName}</strong> AI phone interview is booked for <strong>${humanTime}</strong>.</p>
        <p>We will call <strong>${input.candidatePhone}</strong> at the scheduled time.</p>
        <p>Question set: <strong>${input.questionSetName ?? 'general-screen'}</strong>.</p>
        ${
          input.generalQuestions
            ? `<p>General questions we have configured:</p><pre>${input.generalQuestions}</pre>`
            : ''
        }
        <p>Calendar attachment is included in this email.</p>
        <p>You do not need to book again on the website unless the operator sends you a new invite.</p>
      `,
      ics,
    });
  }

  async sendReminder(input: {
    bookingId: string;
    bookingBaseUrl: string;
    dispatchProfileName: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    startsAt: string;
    endsAt: string;
    timezone: string;
    questionSetName: string | null;
    generalQuestions: string | null;
  }): Promise<void> {
    const startsAt = DateTime.fromISO(input.startsAt).setZone(input.timezone);
    const humanTime = startsAt.toFormat('cccc, LLL d, yyyy h:mm a ZZZZ');

    await sendMail(this.config, {
      to: input.candidateEmail,
      subject: `Reminder: your ${input.dispatchProfileName} interview is in 12 hours`,
      html: `
        <p>Hi ${input.candidateName},</p>
        <p>This is a reminder that your <strong>${input.dispatchProfileName}</strong> AI phone interview is scheduled for <strong>${humanTime}</strong>.</p>
        <p>We will call <strong>${input.candidatePhone}</strong>.</p>
      `,
    });
  }
}
