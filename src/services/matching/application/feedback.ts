import type { MatchingFeedbackReaction, MatchingFeedbackRecord } from '../domain/feedback';
import type { MatchingJobRecord } from '../domain/job';
import type { MatchingSavedJobRecord } from '../domain/savedJob';

export interface MatchingFeedbackRepository {
  listByUser(userId: string): Promise<MatchingFeedbackRecord[]>;
  upsert(record: MatchingFeedbackRecord): Promise<void>;
}

export interface MatchingSavedJobRepository {
  save(record: MatchingSavedJobRecord): Promise<void>;
  remove(userId: string, jobId: string): Promise<void>;
}

export interface MatchingJobLookupRepository {
  getById(jobId: string): Promise<MatchingJobRecord | null>;
}

function buildDocumentId(userId: string, jobId: string) {
  return `${userId}__${jobId}`;
}

export async function recordMatchingFeedback(
  input: {
    userId: string;
    jobId: string;
    reaction: MatchingFeedbackReaction;
  },
  dependencies: {
    jobs: MatchingJobLookupRepository;
    feedback: MatchingFeedbackRepository;
    now?: () => Date;
  },
) {
  const job = await dependencies.jobs.getById(input.jobId);
  if (!job) {
    throw new Error(`Matching job "${input.jobId}" was not found.`);
  }

  const timestamp = (dependencies.now ?? (() => new Date()))().toISOString();
  await dependencies.feedback.upsert({
    id: buildDocumentId(input.userId, input.jobId),
    userId: input.userId,
    jobId: input.jobId,
    reaction: input.reaction,
    companyName: job.companyName,
    jobTitle: job.roleTitle,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return {
    ok: true as const,
    userId: input.userId,
    jobId: input.jobId,
    reaction: input.reaction,
    updatedAt: timestamp,
  };
}

export async function saveMatchingJob(
  input: {
    userId: string;
    jobId: string;
  },
  dependencies: {
    jobs: MatchingJobLookupRepository;
    savedJobs: MatchingSavedJobRepository;
    now?: () => Date;
  },
) {
  const job = await dependencies.jobs.getById(input.jobId);
  if (!job) {
    throw new Error(`Matching job "${input.jobId}" was not found.`);
  }

  const timestamp = (dependencies.now ?? (() => new Date()))().toISOString();
  await dependencies.savedJobs.save({
    id: buildDocumentId(input.userId, input.jobId),
    userId: input.userId,
    jobId: input.jobId,
    companyName: job.companyName,
    jobTitle: job.roleTitle,
    primaryUrl: job.primaryUrl,
    createdAt: timestamp,
  });

  return {
    ok: true as const,
    userId: input.userId,
    jobId: input.jobId,
    savedAt: timestamp,
  };
}

export async function removeSavedMatchingJob(
  input: {
    userId: string;
    jobId: string;
  },
  dependencies: {
    savedJobs: MatchingSavedJobRepository;
  },
) {
  await dependencies.savedJobs.remove(input.userId, input.jobId);
  return {
    ok: true as const,
    userId: input.userId,
    jobId: input.jobId,
  };
}
