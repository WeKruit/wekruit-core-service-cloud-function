import { defineInt, defineString } from 'firebase-functions/params';

export const outboundAppTimezone = defineString('OUTBOUND_APP_TIMEZONE', {
  default: 'America/Chicago',
});
export const outboundBookingSlotMinutes = defineInt('OUTBOUND_BOOKING_SLOT_MINUTES', {
  default: 30,
});
export const outboundBookingHorizonDays = defineInt('OUTBOUND_BOOKING_HORIZON_DAYS', {
  default: 7,
});
export const outboundBookingWorkdayStartHour = defineInt('OUTBOUND_BOOKING_WORKDAY_START_HOUR', {
  default: 9,
});
export const outboundBookingWorkdayEndHour = defineInt('OUTBOUND_BOOKING_WORKDAY_END_HOUR', {
  default: 18,
});
export const outboundBookingLeadHours = defineInt('OUTBOUND_BOOKING_LEAD_HOURS', {
  default: 4,
});
export const outboundBookingReminderHours = defineInt('OUTBOUND_BOOKING_REMINDER_HOURS', {
  default: 12,
});
