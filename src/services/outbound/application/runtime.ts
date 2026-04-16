import {
  outboundAdminApiKey,
  outboundAppBaseUrl,
  outboundGoogleServiceAccountEmail,
  outboundGoogleServiceAccountPrivateKey,
  outboundMailgunApiKey,
  outboundMailgunDomain,
  outboundMailgunFromEmail,
  outboundRetellApiKey,
} from '../../../bootstrap/outboundSecrets';
import {
  outboundAppTimezone,
  outboundBookingHorizonDays,
  outboundBookingLeadHours,
  outboundBookingReminderHours,
  outboundBookingSlotMinutes,
  outboundBookingWorkdayEndHour,
  outboundBookingWorkdayStartHour,
} from '../../../bootstrap/secrets';

export interface OutboundRuntimeConfig {
  appBaseUrl: string;
  appTimezone: string;
  adminApiKey: string;
  bookingSlotMinutes: number;
  bookingHorizonDays: number;
  bookingWorkdayStartHour: number;
  bookingWorkdayEndHour: number;
  bookingLeadHours: number;
  bookingReminderHours: number;
  retellApiKey: string;
  mailgunApiKey: string;
  mailgunDomain: string;
  mailgunFromEmail?: string;
  googleServiceAccountEmail: string;
  googleServiceAccountPrivateKey: string;
}

function requiredSecret(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing required Firebase secret "${name}".`);
  }
  return trimmed;
}

export function getOutboundRuntimeConfig(): OutboundRuntimeConfig {
  return {
    appBaseUrl: requiredSecret(outboundAppBaseUrl.value(), 'OUTBOUND_APP_BASE_URL'),
    appTimezone: outboundAppTimezone.value(),
    adminApiKey: requiredSecret(outboundAdminApiKey.value(), 'OUTBOUND_ADMIN_API_KEY'),
    bookingSlotMinutes: outboundBookingSlotMinutes.value(),
    bookingHorizonDays: outboundBookingHorizonDays.value(),
    bookingWorkdayStartHour: outboundBookingWorkdayStartHour.value(),
    bookingWorkdayEndHour: outboundBookingWorkdayEndHour.value(),
    bookingLeadHours: outboundBookingLeadHours.value(),
    bookingReminderHours: outboundBookingReminderHours.value(),
    retellApiKey: requiredSecret(outboundRetellApiKey.value(), 'OUTBOUND_RETELL_API_KEY'),
    mailgunApiKey: requiredSecret(outboundMailgunApiKey.value(), 'OUTBOUND_MAILGUN_API_KEY'),
    mailgunDomain: requiredSecret(outboundMailgunDomain.value(), 'OUTBOUND_MAILGUN_DOMAIN'),
    mailgunFromEmail: outboundMailgunFromEmail.value().trim() || undefined,
    googleServiceAccountEmail: requiredSecret(
      outboundGoogleServiceAccountEmail.value(),
      'OUTBOUND_GOOGLE_SERVICE_ACCOUNT_EMAIL',
    ),
    googleServiceAccountPrivateKey: requiredSecret(
      outboundGoogleServiceAccountPrivateKey.value(),
      'OUTBOUND_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY',
    ).replace(/\\n/g, '\n'),
  };
}
