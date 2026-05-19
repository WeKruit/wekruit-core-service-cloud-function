import { FieldPath, type Query } from 'firebase-admin/firestore';

import { getCoreFirestore } from '../../../bootstrap/firebase';
import { matchingCollections } from '../../../shared/firestore/collections';
import type { MatchingJobSyncRepository } from '../application/jobSync';
import type {
  MatchingJobRecord,
  MatchingJobStatus,
  MatchingJobSyncState,
  MatchingJobType,
} from '../domain/job';

// 2026-05-18 — drop from 500 → 25. Some matching-jobs docs are heavy
// (embedding 1536 floats + job_description blob → ~100KB each). With 500
// docs/batch the Firestore commit exceeded the 10 MiB transaction limit
// ("INVALID_ARGUMENT: Transaction too big"). 25 × 100 KB = 2.5 MiB stays
// well under the limit and dramatically reduces client retry-split churn.
const FIRESTORE_BATCH_LIMIT = 25;

export interface MatchingJobCursor {
  firstSeenAt: string;
  id: string;
}

export interface MatchingJobQueryOptions {
  limit: number;
  status?: MatchingJobStatus;
  jobType?: MatchingJobType;
  requiresSponsorship?: boolean;
  industryKey?: string | null;
  locationBuckets?: string[];
  searchTokens?: string[];
  requiredSkills?: string[];
  seniorityLevel?: string | null;
  postedAfter?: string | null;
  cursor?: MatchingJobCursor | null;
}

export class MatchingJobRepository implements MatchingJobSyncRepository {
  private readonly firestore = getCoreFirestore();
  private readonly collection = this.firestore.collection(matchingCollections.jobs);

  async getById(jobId: string): Promise<MatchingJobRecord | null> {
    const snapshot = await this.collection.doc(jobId).get();
    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() as MatchingJobRecord;
  }

  async queryJobs(options: MatchingJobQueryOptions): Promise<MatchingJobRecord[]> {
    let query: Query = this.collection;

    if (options.status) {
      query = query.where('status', '==', options.status);
    }
    if (options.jobType) {
      query = query.where('jobType', '==', options.jobType);
    }
    if (options.requiresSponsorship) {
      query = query.where('sponsorship', '==', true);
    }
    if (options.industryKey) {
      query = query.where('industryKey', '==', options.industryKey);
    }
    if (options.seniorityLevel) {
      query = query.where('seniorityLevel', '==', options.seniorityLevel);
    }
    if (options.postedAfter) {
      query = query.where('firstSeenAt', '>=', options.postedAfter);
    }

    if (options.searchTokens && options.searchTokens.length > 0) {
      query = query.where('searchTokens', 'array-contains-any', options.searchTokens.slice(0, 10));
    } else if (options.requiredSkills && options.requiredSkills.length > 0) {
      query = query.where(
        'requiredSkillsIndex',
        'array-contains-any',
        options.requiredSkills.slice(0, 10),
      );
    } else if (options.locationBuckets && options.locationBuckets.length > 0) {
      query = query.where(
        'locationBuckets',
        'array-contains-any',
        options.locationBuckets.slice(0, 10),
      );
    }

    query = query
      .orderBy('firstSeenAt', 'desc')
      .orderBy(FieldPath.documentId(), 'desc')
      .limit(options.limit);

    if (options.cursor) {
      query = query.startAfter(options.cursor.firstSeenAt, options.cursor.id);
    }

    const snapshot = await query.get();
    return snapshot.docs.map((doc) => doc.data() as MatchingJobRecord);
  }

  async getSyncStates(jobIds: string[]): Promise<Map<string, MatchingJobSyncState>> {
    if (jobIds.length === 0) {
      return new Map();
    }

    const snapshots = await this.firestore.getAll(
      ...jobIds.map((jobId) => this.collection.doc(jobId)),
    );

    return new Map(
      snapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => {
          const data = snapshot.data() as Partial<MatchingJobRecord> | undefined;
          return [
            snapshot.id,
            {
              id: snapshot.id,
              contentHash: typeof data?.contentHash === 'string' ? data.contentHash : null,
              status:
                data?.status === 'active' || data?.status === 'inactive' ? data.status : null,
              hasEmbedding: Array.isArray(data?.embedding) && data.embedding.length > 0,
            } satisfies MatchingJobSyncState,
          ];
        }),
    );
  }

  async upsertJobs(jobs: MatchingJobRecord[]): Promise<void> {
    for (let index = 0; index < jobs.length; index += FIRESTORE_BATCH_LIMIT) {
      const chunk = jobs.slice(index, index + FIRESTORE_BATCH_LIMIT);

      // Pre-fetch existing snapshots in one RPC (Firestore.getAll), then
      // skip any doc whose existing status is `inactive` or `dead === true`
      // so manually-flipped lifecycle state survives the next scrape cycle.
      // Required precursor to paJobPoolHygiene workstream: protect bad-active
      // docs that get flipped to inactive from being clobbered by macmini
      // scrape, which always emits status:"active".
      const refs = chunk.map((job) => this.collection.doc(job.id));
      const existing = await this.firestore.getAll(...refs);
      const protectedIds = new Set(
        existing
          .filter((snapshot) => snapshot.exists)
          .filter((snapshot) => {
            const data = snapshot.data() as
              | (Partial<MatchingJobRecord> & { dead?: boolean })
              | undefined;
            return data?.status === 'inactive' || data?.dead === true;
          })
          .map((snapshot) => snapshot.id),
      );
      const writeable = chunk.filter((job) => !protectedIds.has(job.id));

      if (writeable.length < chunk.length) {
        console.log(
          JSON.stringify({
            msg: 'upsertJobs respecting inactive/dead status',
            skipped: chunk.length - writeable.length,
            attempted: chunk.length,
            protectedIds: [...protectedIds],
          }),
        );
      }

      if (writeable.length === 0) {
        continue;
      }

      const batch = this.firestore.batch();
      for (const job of writeable) {
        batch.set(this.collection.doc(job.id), job, { merge: true });
      }
      await batch.commit();
    }
  }
}
