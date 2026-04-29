import cors from 'cors';
import express from 'express';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { z } from 'zod';

import {
  batchUpsertSourceRecordsSchema,
  createEnrichmentReviewDecisionSchema,
  createReviewLabelSchema,
  createSourceRunSchema,
  candidateEnrichmentReviewStatusSchema,
  candidateContactabilitySchema,
  candidateIndustryDomainSchema,
  candidateTrackSchema,
} from '../../domain/records';
import { SourcingService } from '../../application/service';

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));

const service = new SourcingService();
const sourcingOpenAiApiKey = defineSecret('OPENAI_API_KEY');

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
      'approved_candidate',
      'same_person',
      'not_same_person',
      'rejected_bad_record',
      'rejected_not_relevant',
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

app.get('/api/sourcing/candidate-profiles', async (req, res, next) => {
  try {
    const status = req.query.status === 'archived' ? 'archived' : req.query.status === 'active' ? 'active' : undefined;
    const parsedTrack = typeof req.query.track === 'string'
      ? candidateTrackSchema.safeParse(req.query.track)
      : null;
    const parsedDomain = typeof req.query.domain === 'string'
      ? candidateIndustryDomainSchema.safeParse(req.query.domain)
      : null;
    const parsedContactability = typeof req.query.contactability === 'string'
      ? candidateContactabilitySchema.safeParse(req.query.contactability)
      : null;
    const data = await service.listCandidateProfiles({
      limit: parseLimit(req.query.limit, 200, 500),
      status,
      track: parsedTrack?.success ? parsedTrack.data : undefined,
      domain: parsedDomain?.success ? parsedDomain.data : undefined,
      contactability: parsedContactability?.success ? parsedContactability.data : undefined,
      source: typeof req.query.source === 'string' ? req.query.source : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    });
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

app.get('/api/sourcing/candidate-profiles/:profileId', async (req, res, next) => {
  try {
    const data = await service.getCandidateProfileDetails(req.params.profileId);
    res.status(200).json({ data });
  } catch (error) {
    if (error instanceof Error) {
      jsonError(res, 404, error.message);
      return;
    }
    next(error);
  }
});

app.post('/api/sourcing/approved-entities/:approvedEntityId/enrichment:generate', async (req, res, next) => {
  try {
    const data = await service.generateEnrichmentForApprovedEntity(req.params.approvedEntityId);
    res.status(201).json({ data });
  } catch (error) {
    if (error instanceof Error) {
      jsonError(res, 422, error.message);
      return;
    }
    next(error);
  }
});

app.get('/api/sourcing/enrichment-review-items', async (req, res, next) => {
  try {
    const parsedStatus = typeof req.query.status === 'string'
      ? candidateEnrichmentReviewStatusSchema.safeParse(req.query.status)
      : null;
    const data = await service.listEnrichmentReviewItems(
      parsedStatus?.success ? parsedStatus.data : undefined,
    );
    res.status(200).json({ data, total: data.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sourcing/enrichment-review-items/:reviewItemId/decision', async (req, res, next) => {
  try {
    const parsed = createEnrichmentReviewDecisionSchema.parse(req.body);
    const data = await service.submitEnrichmentReviewDecision(req.params.reviewItemId, parsed);
    res.status(200).json({ data });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      jsonError(res, 422, error.message);
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
    secrets: [sourcingOpenAiApiKey],
  },
  app,
);
