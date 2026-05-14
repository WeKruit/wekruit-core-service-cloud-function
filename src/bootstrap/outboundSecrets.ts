import { defineSecret } from 'firebase-functions/params';

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

export const outboundSecrets = [
  outboundAdminApiKey,
  outboundRetellApiKey,
  outboundMailgunApiKey,
  outboundMailgunDomain,
  outboundMailgunFromEmail,
  outboundGoogleServiceAccountEmail,
  outboundGoogleServiceAccountPrivateKey,
  outboundAppBaseUrl,
];
