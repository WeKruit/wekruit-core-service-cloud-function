import cors from 'cors';
import express from 'express';
import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  batchUpsertSourceRecordsSchema,
  createReviewLabelSchema,
  createSourceRunSchema,
} from '../../domain/records';
import { SourcingService } from '../../application/service';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

const service = new SourcingService();

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

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Internal server error';
  jsonError(res, 500, message);
});

export const sourcingApi = onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
  },
  app,
);
