import { getCoreFirestore } from '../../../bootstrap/firebase';
import { sourcingCollections } from '../../../shared/firestore/collections';
import type {
  ApprovedEntity,
  DedupCandidate,
  EvidenceRecord,
  ReviewLabelRecord,
  SourceRecord,
  SourceRunRecord,
} from '../domain/records';

export class SourcingRepository {
  private readonly db = getCoreFirestore();
  private readonly sourceRunCollection = this.db.collection(sourcingCollections.sourceRuns);
  private readonly sourceRecordCollection = this.db.collection(sourcingCollections.sourceRecords);
  private readonly evidenceCollection = this.db.collection(sourcingCollections.evidence);
  private readonly dedupCandidateCollection = this.db.collection(sourcingCollections.dedupCandidates);
  private readonly reviewLabelCollection = this.db.collection(sourcingCollections.reviewLabels);
  private readonly approvedEntityCollection = this.db.collection(sourcingCollections.approvedEntities);

  async createSourceRun(run: SourceRunRecord): Promise<SourceRunRecord> {
    await this.sourceRunCollection.doc(run.id).set(run);
    return run;
  }

  async getSourceRun(runId: string): Promise<SourceRunRecord | null> {
    const snapshot = await this.sourceRunCollection.doc(runId).get();
    return snapshot.exists ? (snapshot.data() as SourceRunRecord) : null;
  }

  async listSourceRuns(limit = 50): Promise<SourceRunRecord[]> {
    const snapshot = await this.sourceRunCollection.limit(Math.max(1, Math.min(limit, 200))).get();
    return snapshot.docs
      .map((doc) => doc.data() as SourceRunRecord)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async updateSourceRun(run: SourceRunRecord): Promise<SourceRunRecord> {
    await this.sourceRunCollection.doc(run.id).set(run);
    return run;
  }

  async upsertSourceRecords(records: SourceRecord[]): Promise<void> {
    const batch = this.db.batch();
    for (const record of records) {
      batch.set(this.sourceRecordCollection.doc(record.id), record);
    }
    await batch.commit();
  }

  async getSourceRecordsByIds(ids: string[]): Promise<SourceRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const snapshots = await Promise.all(ids.map((id) => this.sourceRecordCollection.doc(id).get()));
    return snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => snapshot.data() as SourceRecord);
  }

  async listSourceRecordsForRun(runId: string, limit = 200): Promise<SourceRecord[]> {
    const snapshot = await this.sourceRecordCollection
      .where('sourceRunId', '==', runId)
      .limit(Math.max(1, Math.min(limit, 500)))
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as SourceRecord)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async countSourceRecordsForRun(runId: string): Promise<number> {
    const snapshot = await this.sourceRecordCollection.where('sourceRunId', '==', runId).get();
    return snapshot.size;
  }

  async upsertEvidence(records: EvidenceRecord[]): Promise<void> {
    if (records.length === 0) {
      return;
    }
    const batch = this.db.batch();
    for (const record of records) {
      batch.set(this.evidenceCollection.doc(record.id), record);
    }
    await batch.commit();
  }

  async getEvidenceByIds(ids: string[]): Promise<EvidenceRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const snapshots = await Promise.all(ids.map((id) => this.evidenceCollection.doc(id).get()));
    return snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => snapshot.data() as EvidenceRecord);
  }

  async listEvidenceBySourceRecordIds(sourceRecordIds: string[]): Promise<EvidenceRecord[]> {
    if (sourceRecordIds.length === 0) {
      return [];
    }
    const snapshots = await Promise.all(
      sourceRecordIds.map((sourceRecordId) =>
        this.evidenceCollection.where('sourceRecordId', '==', sourceRecordId).get(),
      ),
    );
    return snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => doc.data() as EvidenceRecord));
  }

  async listEvidenceByValueHash(valueHash: string): Promise<EvidenceRecord[]> {
    const snapshot = await this.evidenceCollection.where('valueHash', '==', valueHash).limit(50).get();
    return snapshot.docs.map((doc) => doc.data() as EvidenceRecord);
  }

  async countEvidenceForRun(runId: string): Promise<number> {
    const snapshot = await this.evidenceCollection.where('sourceRunId', '==', runId).get();
    return snapshot.size;
  }

  async upsertDedupCandidate(candidate: DedupCandidate): Promise<DedupCandidate> {
    const existing = await this.dedupCandidateCollection.doc(candidate.id).get();
    if (existing.exists) {
      const existingCandidate = existing.data() as DedupCandidate;
      if (existingCandidate.status !== 'pending_review') {
        return existingCandidate;
      }
      const merged: DedupCandidate = {
        ...candidate,
        createdAt: existingCandidate.createdAt,
        updatedAt: candidate.updatedAt,
      };
      await this.dedupCandidateCollection.doc(candidate.id).set(merged);
      return merged;
    }
    await this.dedupCandidateCollection.doc(candidate.id).set(candidate);
    return candidate;
  }

  async getDedupCandidate(id: string): Promise<DedupCandidate | null> {
    const snapshot = await this.dedupCandidateCollection.doc(id).get();
    return snapshot.exists ? (snapshot.data() as DedupCandidate) : null;
  }

  async listDedupCandidates(status?: DedupCandidate['status']): Promise<DedupCandidate[]> {
    const snapshot = status
      ? await this.dedupCandidateCollection.where('status', '==', status).limit(200).get()
      : await this.dedupCandidateCollection.limit(200).get();
    return snapshot.docs
      .map((doc) => doc.data() as DedupCandidate)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async countDedupCandidatesForRun(runId: string): Promise<number> {
    const snapshot = await this.dedupCandidateCollection.where('createdFromSourceRunId', '==', runId).get();
    return snapshot.size;
  }

  async listRecordsByNameInstitutionKey(nameInstitutionKey: string): Promise<SourceRecord[]> {
    const snapshot = await this.sourceRecordCollection.where('nameInstitutionKey', '==', nameInstitutionKey).limit(50).get();
    return snapshot.docs.map((doc) => doc.data() as SourceRecord);
  }

  async createReviewLabel(label: ReviewLabelRecord): Promise<ReviewLabelRecord> {
    await this.reviewLabelCollection.doc(label.id).set(label);
    return label;
  }

  async markDedupCandidateReviewed(
    candidate: DedupCandidate,
    status: DedupCandidate['status'],
    now = new Date().toISOString(),
  ): Promise<DedupCandidate> {
    const reviewed: DedupCandidate = {
      ...candidate,
      status,
      updatedAt: now,
    };
    await this.dedupCandidateCollection.doc(reviewed.id).set(reviewed);
    return reviewed;
  }

  async markDedupCandidatesReviewed(
    candidates: DedupCandidate[],
    status: DedupCandidate['status'],
    now = new Date().toISOString(),
  ): Promise<DedupCandidate[]> {
    if (candidates.length === 0) {
      return [];
    }

    const batch = this.db.batch();
    const reviewed = candidates.map((candidate) => ({
      ...candidate,
      status,
      updatedAt: now,
    }));

    for (const candidate of reviewed) {
      batch.set(this.dedupCandidateCollection.doc(candidate.id), candidate);
    }

    await batch.commit();
    return reviewed;
  }

  async upsertApprovedEntity(entity: ApprovedEntity): Promise<ApprovedEntity> {
    await this.approvedEntityCollection.doc(entity.id).set(entity);
    return entity;
  }

  async listApprovedEntities(): Promise<ApprovedEntity[]> {
    const snapshot = await this.approvedEntityCollection.limit(200).get();
    return snapshot.docs
      .map((doc) => doc.data() as ApprovedEntity)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
