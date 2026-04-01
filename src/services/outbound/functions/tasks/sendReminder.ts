import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { DateTime } from 'luxon';

import { outboundSecrets } from '../../../../bootstrap/secrets';
import { outboundQueueNames } from '../../../../shared/tasks/queueNames';
import { buildBookingBaseUrl } from '../../application/http';
import { getOutboundRuntimeConfig } from '../../application/runtime';
import { OutboundMailgunService } from '../../integrations/mailgun';
import { OutboundBookingRepository } from '../../repositories/bookingRepository';

interface OutboundReminderTaskPayload {
  bookingId: string;
}

const bookingRepository = new OutboundBookingRepository();

export const outboundSendReminder = onTaskDispatched<OutboundReminderTaskPayload>(
  {
    region: 'us-central1',
    retryConfig: {
      maxAttempts: 5
    },
    rateLimits: {
      maxConcurrentDispatches: 5
    },
    secrets: outboundSecrets
  },
  async (request) => {
    const bookingId = request.data.bookingId;
    if (!bookingId) {
      console.warn(`Queue ${outboundQueueNames.sendReminder} received task without bookingId`);
      return;
    }

    const config = getOutboundRuntimeConfig();
    const mailerService = new OutboundMailgunService(config);
    const entry = await bookingRepository.getBookingDetails(bookingId);

    if (!entry) {
      console.warn(`Queue ${outboundQueueNames.sendReminder} could not find booking ${bookingId}`);
      return;
    }

    const now = DateTime.utc();
    const startsAt = DateTime.fromISO(entry.booking.startsAt);

    if (
      entry.booking.status !== 'scheduled' ||
      entry.booking.reminderSentAt !== null ||
      startsAt <= now
    ) {
      return;
    }

    await mailerService.sendReminder({
      bookingId: entry.booking.id,
      bookingBaseUrl: buildBookingBaseUrl(config),
      dispatchProfileName: entry.booking.dispatchProfileName,
      candidateName: entry.candidate.fullName,
      candidateEmail: entry.candidate.email,
      candidatePhone: entry.candidate.phone,
      startsAt: entry.booking.startsAt,
      endsAt: entry.booking.endsAt,
      timezone: entry.booking.timezone,
      questionSetName: entry.booking.questionSetName,
      generalQuestions: entry.booking.generalQuestions,
    });

    await bookingRepository.markReminderSent(entry.booking.id, now.toISO() ?? new Date().toISOString());
  },
);
