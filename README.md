# WeKruit Core Service Cloud Function

Firebase-native backend for WeKruit services.

This repo is the backend half of the approved split:

- frontend repo: `/Users/adam/Desktop/WeKruit/WeKruit-Outbound`
- backend repo: `/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function`

Current service coverage:

- `outbound`

Architecture:

- [ARCHITECTURE.md](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/ARCHITECTURE.md)

## Resource Naming Contract

All outbound Firebase resources use the `outbound-*` prefix.

### Functions

- `outbound-api`
- `outbound-retell-webhook`
- `outbound-send-reminder`
- `outbound-start-call`

### Firestore collections

- `outbound-candidates`
- `outbound-dispatch-profiles`
- `outbound-scheduling-invites`
- `outbound-bookings`
- `outbound-call-artifacts`

### Cloud Tasks queues

- `outbound-send-reminder`
- `outbound-start-call`

### Secret Manager

- `OUTBOUND_ADMIN_API_KEY`
- `OUTBOUND_RETELL_API_KEY`
- `OUTBOUND_MAILGUN_API_KEY`
- `OUTBOUND_MAILGUN_DOMAIN`
- `OUTBOUND_MAILGUN_FROM_EMAIL`
- `OUTBOUND_GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `OUTBOUND_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `OUTBOUND_APP_BASE_URL`

## Environment Model

Use separate Firebase projects. Do not mix staging and production data in one project.

- `staging` alias -> `wekruit-dev-env`
- `production` alias -> `wekruit-5f89b`

Copy [.firebaserc.example](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/.firebaserc.example) to `.firebaserc` and replace the project IDs if your actual Firebase project IDs differ.

## Structure

```text
src/
  bootstrap/
  shared/
  services/
    outbound/
      application/
      domain/
      repositories/
      integrations/
      functions/
        http/
        tasks/
```

## Outbound Runtime Responsibilities

The outbound service owns:

1. dispatch profile APIs
2. public booking APIs
3. invite lookup and booking APIs
4. Google Calendar slot lookup and event creation
5. Mailgun invite / confirmation / reminder delivery
6. Retell outbound call trigger
7. Retell webhook persistence
8. deterministic reminder and call execution through Cloud Tasks

## Secret Mapping

Old env shape -> Firebase Secret/Param shape:

- `ADMIN_API_KEY` -> `OUTBOUND_ADMIN_API_KEY`
- `RETELL_API_KEY` -> `OUTBOUND_RETELL_API_KEY`
- `MAILGUN_API_KEY` -> `OUTBOUND_MAILGUN_API_KEY`
- `MAILGUN_DOMAIN` -> `OUTBOUND_MAILGUN_DOMAIN`
- `MAILGUN_FROM_EMAIL` -> `OUTBOUND_MAILGUN_FROM_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` -> `OUTBOUND_GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` -> `OUTBOUND_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `APP_BASE_URL` -> `OUTBOUND_APP_BASE_URL`
- `APP_TIMEZONE` -> `OUTBOUND_APP_TIMEZONE`
- `BOOKING_SLOT_MINUTES` -> `OUTBOUND_BOOKING_SLOT_MINUTES`
- `BOOKING_HORIZON_DAYS` -> `OUTBOUND_BOOKING_HORIZON_DAYS`
- `BOOKING_WORKDAY_START_HOUR` -> `OUTBOUND_BOOKING_WORKDAY_START_HOUR`
- `BOOKING_WORKDAY_END_HOUR` -> `OUTBOUND_BOOKING_WORKDAY_END_HOUR`
- `BOOKING_LEAD_HOURS` -> `OUTBOUND_BOOKING_LEAD_HOURS`
- `BOOKING_REMINDER_HOURS` -> `OUTBOUND_BOOKING_REMINDER_HOURS`

## Runtime Params

Template:

- [.env.example](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/.env.example)

Local project-specific param files are intentionally untracked.

## Local Commands

Install:

```bash
npm install
```

Typecheck:

```bash
npm run typecheck
```

Build:

```bash
npm run build
```

Run local emulators:

```bash
npm run serve:staging
```

Deploy:

```bash
npm run deploy:staging
npm run deploy:production
```

## Required Setup Before Deploy

1. Create `.firebaserc` from `.firebaserc.example`.
2. Create the staging and production Firebase projects, or replace the aliases with the actual project IDs.
3. Create all `OUTBOUND_*` secrets in Firebase Secret Manager for each project.
4. Set the `OUTBOUND_*` non-secret params during deploy or through Firebase config.
5. Deploy this repo before pointing the frontend Hosting rewrites at the new environment.

## Verification

```bash
npm run typecheck
npm run build
node -e "const mod=require('./lib/index.js'); console.log(Object.keys(mod))"
```

Expected export keys:

- `outbound-api`
- `outbound-retell-webhook`
- `outbound-send-reminder`
- `outbound-start-call`
