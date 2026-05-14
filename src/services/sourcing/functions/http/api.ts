import cors from 'cors';
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';

// BRIGHT_DATA_API_KEY secret binding is intentionally NOT declared here while
// the secret has no enabled versions (Adam revoked the leaked key; no rotated
// key set yet). The runtime layer in `integrations/brightdata.ts` reads
// `process.env.BRIGHT_DATA_API_KEY` and returns 503 when absent. Once Adam
// adds a new version via
//   echo -n "<KEY>" | gcloud secrets versions add BRIGHT_DATA_API_KEY \
//     --project=wekruit-5f89b --data-file=-
// re-add `import { defineSecret } from 'firebase-functions/params'` +
// `const brightDataApiKey = defineSecret('BRIGHT_DATA_API_KEY')` + add
// `secrets: [brightDataApiKey]` to the onRequest config below, then deploy.

import {
  batchUpsertSourceRecordsSchema,
  createReviewLabelSchema,
  createSourceRunSchema,
} from '../../domain/records';
import { SourcingService } from '../../application/service';
import {
  BrightDataHttpError,
  BrightDataKeyMissingError,
} from '../../integrations/brightdata';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

const service = new SourcingService();

function parseLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function jsonError(
  res: { status: (code: number) => { json: (payload: unknown) => unknown } },
  status: number,
  message: string,
) {
  res.status(status).json({ error: { message } });
}

function sendHealth(_req: express.Request, res: express.Response) {
  res.status(200).json({
    ok: true,
    service: 'sourcing',
    runtime: 'firebase-functions',
  });
}

app.get('/health', sendHealth);
app.get('/api/sourcing/health', sendHealth);

app.get('/api/sourcing/source-runs', async (req, res, next) => {
  try {
    const data = await service.listSourceRuns(parseLimit(req.query.limit, 25, 100));
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sourcing/source-runs', async (req, res, next) => {
  try {
    const parsed = createSourceRunSchema.parse(req.body);
    const data = await service.createSourceRun(parsed);
    res.status(201).json({ data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.get('/api/sourcing/source-runs/:runId/source-records', async (req, res, next) => {
  try {
    const data = await service.listSourceRecordsForRun(
      req.params.runId,
      parseLimit(req.query.limit, 250, 500),
    );
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    if (error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.post('/api/sourcing/source-records:batchUpsert', async (req, res, next) => {
  try {
    const parsed = batchUpsertSourceRecordsSchema.parse(req.body);
    const result = await service.batchUpsertSourceRecords(parsed);
    res.status(200).json({
      data: {
        sourceRun: result.sourceRun,
        sourceRecords: result.sourceRecords,
        evidence: result.evidence,
        dedupCandidates: result.dedupCandidates,
      },
      counts: {
        sourceRecords: result.sourceRecords.length,
        evidence: result.evidence.length,
        dedupCandidates: result.dedupCandidates.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.post('/api/sourcing/source-runs/:runId/complete', async (req, res, next) => {
  try {
    const data = await service.completeSourceRun(req.params.runId);
    res.status(200).json({ data });
  } catch (error) {
    if (error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.get('/api/sourcing/dedup-candidates', async (req, res, next) => {
  try {
    const requestedStatus = typeof req.query.status === 'string' ? req.query.status : undefined;
    const includeDetails = req.query.include === 'details';
    const status = [
      'pending_review',
      'same_person',
      'not_same_person',
      'unsure',
      'suppressed',
    ].includes(requestedStatus ?? '')
      ? requestedStatus as Parameters<typeof service.listDedupCandidates>[0]
      : undefined;
    const data = includeDetails
      ? await service.listDedupCandidateDetails(status)
      : await service.listDedupCandidates(status);
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sourcing/review-labels', async (req, res, next) => {
  try {
    const parsed = createReviewLabelSchema.parse(req.body);
    const data = await service.createReviewLabel(parsed);
    res.status(201).json({ data });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.get('/api/sourcing/approved-entities', async (_req, res, next) => {
  try {
    const data = await service.listApprovedEntities();
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

/**
 * P3 — Vendor LinkedIn enrichment endpoint.
 *
 * Body shape (one of):
 *   { sourceRecordId: "..." }    — direct lookup by sourcing source-record
 *   { approvedEntityId: "..." }  — lookup by approved-entity (resolves via its source-records)
 *   { linkedinUrl: "https://..." } — direct URL lookup
 *
 * Response:
 *   200 { data: { matchId, vendor: 'brightdata', linkedinUrl, profile, snapshotId, runId } }
 *   400 if no linkedin url resolved
 *   404 if entity / record not found
 *   503 if BRIGHT_DATA_API_KEY secret is not configured (graceful)
 *   502 if BrightData upstream errored
 */
const vendorLookupBodySchema = z.object({
  sourceRecordId: z.string().trim().min(1).optional(),
  approvedEntityId: z.string().trim().min(1).optional(),
  linkedinUrl: z.string().trim().url().optional(),
});

app.post('/api/sourcing/vendor-profile-lookup:run', async (req, res, next) => {
  try {
    const parsed = vendorLookupBodySchema.parse(req.body);
    if (!parsed.sourceRecordId && !parsed.approvedEntityId && !parsed.linkedinUrl) {
      jsonError(res, 400, 'one_of_sourceRecordId_approvedEntityId_linkedinUrl_required');
      return;
    }
    const data = await service.runVendorProfileLookup(parsed);
    res.status(200).json({ data });
  } catch (error) {
    if (error instanceof BrightDataKeyMissingError) {
      jsonError(res, 503, error.message);
      return;
    }
    if (error instanceof BrightDataHttpError) {
      jsonError(res, 502, error.message);
      return;
    }
    if (error instanceof z.ZodError) {
      jsonError(res, 422, error.message);
      return;
    }
    if (error instanceof Error && /not[_ ]found/i.test(error.message)) {
      jsonError(res, 404, error.message);
      return;
    }
    if (error instanceof Error && /linkedin/i.test(error.message)) {
      jsonError(res, 400, error.message);
      return;
    }
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Internal server error';
  jsonError(res, 500, message);
});

export const sourcingApi = onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    timeoutSeconds: 120,
  },
  app,
);
