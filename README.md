# WeKruit Core Service Cloud Function

Firebase-native backend monorepo for WeKruit services.

This repo is not "the outbound repo moved into Firebase". It is the shared backend home for every WeKruit core service that should run on:

- Firebase Hosting rewrites
- HTTPS Cloud Functions
- Firestore
- Cloud Tasks
- Firebase Secret Manager

Current live service coverage:

- `outbound`
- `sourcing`

Related repos:

- frontend repo: `https://github.com/WeKruit/wekruit-outbound`
- backend repo: `https://github.com/WeKruit/wekruit-core-service-cloud-function`

Architecture:

- [ARCHITECTURE.md](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/ARCHITECTURE.md)

## Repo Intent

This repo exists so new backend services do **not** get created as one-off Firebase projects with random structure.

Every service added here must follow the same contract:

1. one service directory under `src/services/<service-name>`
2. one resource prefix: `<service-name>-*`
3. separate staging and production Firebase projects
4. Firebase-native runtime only
5. deterministic data ownership and scheduling

If a service does not fit those rules, it should not be added here.

## Current Service Registry

| Service | Status | Resource Prefix | Notes |
|---|---|---|---|
| `outbound` | live | `outbound-*` | interview booking, invite sends, reminders, Retell calls |
| `sourcing` | prototype | `sourcing-*` | scraping source-record ingest, evidence extraction, human dedup review |

## Firebase Environment Model

Do not mix environments inside one Firestore database.

Current aliases:

- `staging` -> `wekruit-dev-env`
- `production` -> `wekruit-5f89b`

Current production Hosting sites:

- frontend site: `wekruit-outbound`
- default Firebase domain: [https://wekruit-outbound.web.app](https://wekruit-outbound.web.app)

Current staging Hosting sites:

- frontend site: `wekruit-outbound-staging`
- default Firebase domain: [https://wekruit-outbound-staging.web.app](https://wekruit-outbound-staging.web.app)

Copy [.firebaserc.example](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/.firebaserc.example) to `.firebaserc` only if you need a fresh local alias file. This repo already uses:

- `staging`
- `production`

For isolated service deploys, set `CORE_SERVICE_EXPORT_MODE` in the ignored
project env file:

- `CORE_SERVICE_EXPORT_MODE=sourcing` exports only `sourcing-api`
- `CORE_SERVICE_EXPORT_MODE=outbound` exports only outbound functions
- unset exports every service

This keeps a sourcing-only deploy from requiring outbound Secret Manager values.
Use `firebase.sourcing.json` for sourcing-only deploys; it builds a generated
`deploy/sourcing-functions` bundle containing only `sourcing-api` dependencies,
so outbound Secret Manager params are not registered during Firebase analysis.

For the web review console, do not assume the shared default site
`wekruit-dev-env.web.app` is dedicated to sourcing. Use a preview channel or a
dedicated Hosting site/target for sourcing review. Current staging preview
pattern:

- `firebase hosting:channel:deploy sourcing-review --config firebase.sourcing.json --project staging`

## Directory Contract

Every service must fit into this shape:

```text
src/
  bootstrap/
    firebase.ts
    secrets.ts
  shared/
    firestore/
    http/
    tasks/
    time/
    validation/
  services/
    <service-name>/
      application/
      domain/
      repositories/
      integrations/
      functions/
        http/
        tasks/
```

Meaning:

- `application/`: orchestration and service-level use cases
- `domain/`: canonical record shapes and domain invariants
- `repositories/`: Firestore data access only
- `integrations/`: third-party APIs
- `functions/http/`: HTTPS function entrypoints
- `functions/tasks/`: Cloud Task handlers

Shared code belongs in `src/shared/*`. If code is only used by one service, keep it inside that service.

## How A New Service Gets Added

If tomorrow you add `screening`, `matching`, or any other core backend service, add it here instead of creating a separate Firebase codebase.

### 1. Pick the service name

The service name is the root contract.

Example:

- service name: `screening`

That means every Firebase resource must start with:

- `screening-*`

### 2. Create the service folders

```text
src/services/screening/
  application/
  domain/
  repositories/
  integrations/
  functions/
    http/
    tasks/
```

### 3. Add Firestore collection names

Collection names must be explicit and prefixed.

Example:

- `screening-candidates`
- `screening-sessions`
- `screening-artifacts`

Do not reuse `outbound-*` collections for another service.

### 4. Add Secret Manager params in `bootstrap/secrets.ts`

Secrets:

- `SCREENING_API_KEY`
- `SCREENING_VENDOR_SECRET`

Params:

- `SCREENING_APP_TIMEZONE`
- `SCREENING_LOOKAHEAD_DAYS`

### 5. Export the service from `src/index.ts`

Each service's public runtime surface should be obvious from the root export.

Example shape:

```ts
export = {
  outbound: { ... },
  screening: {
    api: screeningApi,
    run: {
      session: screeningRunSession,
    },
  },
};
```

### 6. Update this README and `ARCHITECTURE.md`

Before deploy, document:

- service purpose
- collections
- functions
- task queues
- secrets

If this is missing, the service is not finished.

## Naming Contract

The naming rule is simple:

- Cloud Functions: `<service-name>-*`
- Firestore collections: `<service-name>-*`
- Cloud Tasks queues: `<service-name>-*`
- params/secrets: `<SERVICE_NAME_UPPER>_*`

### Current `outbound` resources

#### Functions

- `outbound-api`
- `outbound-retell-webhook`
- `outbound-send-reminder`
- `outbound-start-call`

#### Firestore collections

- `outbound-candidates`
- `outbound-dispatch-profiles`
- `outbound-scheduling-invites`
- `outbound-bookings`
- `outbound-call-artifacts`

#### Cloud Tasks queues

- `outbound-send-reminder`
- `outbound-start-call`

#### Secret Manager

- `OUTBOUND_ADMIN_API_KEY`
- `OUTBOUND_RETELL_API_KEY`
- `OUTBOUND_MAILGUN_API_KEY`
- `OUTBOUND_MAILGUN_DOMAIN`
- `OUTBOUND_MAILGUN_FROM_EMAIL`
- `OUTBOUND_GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `OUTBOUND_GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `OUTBOUND_APP_BASE_URL`

#### Runtime params

- `OUTBOUND_APP_TIMEZONE`
- `OUTBOUND_BOOKING_SLOT_MINUTES`
- `OUTBOUND_BOOKING_HORIZON_DAYS`
- `OUTBOUND_BOOKING_WORKDAY_START_HOUR`
- `OUTBOUND_BOOKING_WORKDAY_END_HOUR`
- `OUTBOUND_BOOKING_LEAD_HOURS`
- `OUTBOUND_BOOKING_REMINDER_HOURS`

### Current `sourcing` resources

#### Functions

- `sourcing-api`

#### Firestore collections

- `sourcing-source-runs`
- `sourcing-source-records`
- `sourcing-evidence`
- `sourcing-dedup-candidates`
- `sourcing-review-labels`
- `sourcing-approved-entities`

#### Hosting

- static operator console under `web/`
- `/api/sourcing/**` Hosting rewrite to `sourcing-api`

#### API routes

- `POST /api/sourcing/source-runs`
- `POST /api/sourcing/source-records:batchUpsert`
- `POST /api/sourcing/source-runs/:runId/complete`
- `GET /api/sourcing/dedup-candidates?status=pending_review`
- `GET /api/sourcing/dedup-candidates?status=pending_review&include=details`
- `POST /api/sourcing/review-labels`
- `GET /api/sourcing/approved-entities`

#### Cloud Tasks queues

- `sourcing-materialize-approved-entity`

## Outbound Service Responsibilities

`outbound` currently owns:

1. dispatch profile APIs
2. public booking APIs
3. invite token lookup and booking APIs
4. Google Calendar slot lookup and event creation
5. Mailgun invite / confirmation / reminder delivery
6. Retell outbound call trigger
7. Retell webhook persistence
8. deterministic reminder and call execution through Cloud Tasks

## Secret And Param Mapping

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

Template:

- [.env.example](/Users/adam/Desktop/WeKruit/wekruit-core-service-cloud-function/.env.example)

## Commands

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

Run emulators:

```bash
npm run serve:staging
```

Deploy backend:

```bash
npm run deploy:staging
npm run deploy:production
```

## Deploy Checklist

For a new environment:

1. create the Firebase project
2. add the project alias to `.firebaserc`
3. create every required Secret Manager secret
4. set runtime params
5. deploy backend functions and firestore rules
6. deploy frontend Hosting from the frontend repo
7. verify Hosting rewrites to this backend
8. run end-to-end proof:
   - public booking
   - invite booking
   - reminder scheduling
   - call scheduling
   - webhook artifact writeback

## Firebase Custom Domain

The production Firebase Hosting custom domain mapping for `outbound.wekruit.com` has already been created on the Firebase side.

What remains is your DNS provider update.

### Add this record at your DNS provider

| Type | Name / Host | Value / Target |
|---|---|---|
| `CNAME` | `outbound` | `wekruit-outbound.web.app` |

Notes:

- if your DNS provider supports proxying, keep this record unproxied until Firebase verifies it
- remove any old conflicting `A` or `CNAME` records on `outbound.wekruit.com`
- after DNS propagates, Firebase Hosting will finish ownership and certificate provisioning automatically

Current Firebase custom-domain state:

- host state: `HOST_UNHOSTED`
- ownership state: `OWNERSHIP_MISSING`
- certificate state: `CERT_PREPARING`

That means the backend/frontend deploy is done. DNS is the only remaining step for the vanity domain.

## Verification

Build verification:

```bash
npm run typecheck
npm run build
node -e "const mod=require('./lib/index.js'); console.log(Object.keys(mod))"
```

Expected current root export keys:

- `outbound`

Current live proof:

- public site: [https://wekruit-outbound.web.app](https://wekruit-outbound.web.app)
- public routes API: [https://wekruit-outbound.web.app/api/public/dispatch-profiles](https://wekruit-outbound.web.app/api/public/dispatch-profiles)
- full `outbound` lifecycle has already been verified on Firebase production:
  - booking
  - Google Calendar event creation
  - reminder scheduling
  - Retell outbound call
  - webhook artifact persistence
