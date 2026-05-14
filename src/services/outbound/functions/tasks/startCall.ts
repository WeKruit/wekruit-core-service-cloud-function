import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { DateTime } from 'luxon';

import { outboundSecrets } from '../../../../bootstrap/outboundSecrets';
import { outboundQueueNames } from '../../../../shared/tasks/queueNames';
import { getOutboundRuntimeConfig } from '../../application/runtime';
import { OutboundRetellService } from '../../integrations/retell';
import { OutboundBookingRepository } from '../../repositories/bookingRepository';

interface OutboundStartCallTaskPayload {
  bookingId: string;
}

const bookingRepository = new OutboundBookingRepository();

export const outboundStartCall = onTaskDispatched<OutboundStartCallTaskPayload>(
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
      console.warn(`Queue ${outboundQueueNames.startCall} received task without bookingId`);
      return;
    }

    const config = getOutboundRuntimeConfig();
    const retellService = new OutboundRetellService(config);
    const entry = await bookingRepository.getBookingDetails(bookingId);

    if (!entry) {
      console.warn(`Queue ${outboundQueueNames.startCall} could not find booking ${bookingId}`);
      return;
    }

    const now = DateTime.utc();
    const startsAt = DateTime.fromISO(entry.booking.startsAt);

    if (
      entry.booking.status !== 'scheduled' ||
      entry.booking.retellCallId !== null ||
      startsAt > now
    ) {
      return;
    }

    const response = await retellService.startInterviewCall({
      bookingId: entry.booking.id,
      dispatchProfileSlug: entry.booking.dispatchProfileSlug,
      dispatchProfileName: entry.booking.dispatchProfileName,
      retellAgentId: entry.booking.retellAgentId,
      retellFromPhoneNumber: entry.booking.retellFromPhoneNumber,
      candidateName: entry.candidate.fullName,
      candidateEmail: entry.candidate.email,
      candidatePhone: entry.candidate.phone,
      startsAt: entry.booking.startsAt,
      timezone: entry.booking.timezone,
      questionSetName: entry.booking.questionSetName,
      generalQuestions: entry.booking.generalQuestions,
    });

    await bookingRepository.attachRetellCall(
      entry.booking.id,
      response.callId,
      now.toISO() ?? new Date().toISOString(),
    );
  },
);
