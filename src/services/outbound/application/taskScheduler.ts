import { createHash } from 'node:crypto';

import { getFunctions } from 'firebase-admin/functions';
import { DateTime } from 'luxon';

import { outboundQueueNames } from '../../../shared/tasks/queueNames';
import type { OutboundBookingRecord } from '../domain/records';

interface BookingTaskPayload {
  bookingId: string;
}

function buildTaskId(prefix: 'reminder' | 'call', bookingId: string): string {
  return createHash('sha256').update(`${prefix}:${bookingId}`).digest('hex').slice(0, 32);
}

export class OutboundTaskScheduler {
  private readonly functions = getFunctions();

  async scheduleForBooking(booking: OutboundBookingRecord, reminderHours: number): Promise<void> {
    const bookingStart = DateTime.fromISO(booking.startsAt);
    const now = DateTime.utc();

    if (bookingStart > now) {
      const reminderAt = bookingStart.minus({ hours: reminderHours });
      if (reminderAt < bookingStart) {
        await this.functions
          .taskQueue<BookingTaskPayload>(outboundQueueNames.sendReminder)
          .enqueue(
            { bookingId: booking.id },
            {
              id: buildTaskId('reminder', booking.id),
              ...(reminderAt > now ? { scheduleTime: reminderAt.toJSDate() } : {}),
            },
          );
      }
    }

    await this.functions
      .taskQueue<BookingTaskPayload>(outboundQueueNames.startCall)
      .enqueue(
        { bookingId: booking.id },
        {
          id: buildTaskId('call', booking.id),
          ...(bookingStart > now ? { scheduleTime: bookingStart.toJSDate() } : {}),
        },
      );
  }
}
