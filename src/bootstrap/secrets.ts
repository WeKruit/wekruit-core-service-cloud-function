import { defineInt, defineSecret, defineString } from 'firebase-functions/params';

export const outboundAdminApiKey = defineSecret('OUTBOUND_ADMIN_API_KEY');
export const outboundRetellApiKey = defineSecret('OUTBOUND_RETELL_API_KEY');
export const outboundMailgunApiKey = defineSecret('OUTBOUND_MAILGUN_API_KEY');
export const outboundMailgunDomain = defineSecret('OUTBOUND_MAILGUN_DOMAIN');
export const outboundMailgunFromEmail = defineSecret('OUTBOUND_MAILGUN_FROM_EMAIL');
export const outboundGoogleServiceAccountEmail = defineSecret('OUTBOUND_GOOGLE_SERVICE_ACCOUNT_EMAIL');
export const outboundGoogleServiceAccountPrivateKey = defineSecret(
  'OUTBOUND_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
);
export const outboundAppBaseUrl = defineSecret('OUTBOUND_APP_BASE_URL');

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

export const outboundSecrets = [
  outboundAdminApiKey,
  outboundRetellApiKey,
  outboundMailgunApiKey,
  outboundMailgunDomain,
  outboundMailgunFromEmail,
  outboundGoogleServiceAccountEmail,
  outboundGoogleServiceAccountPrivateKey,
  outboundAppBaseUrl
];
