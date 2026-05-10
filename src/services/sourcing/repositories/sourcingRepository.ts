import { getCoreFirestore } from '../../../bootstrap/firebase';
import { sourcingCollections } from '../../../shared/firestore/collections';
import type {
  ApprovedEntity,
  CandidateEnrichmentReviewItem,
  CandidateEnrichmentReviewStatus,
  CandidateEnrichmentRun,
  CandidateProfile,
  DedupCandidate,
  EvidenceRecord,
  ReviewLabelRecord,
  SourceRecord,
  SourceRunRecord,
  VendorEnrichmentRun,
  VendorProfileMatch,
} from '../domain/records';

function uniqueById<T extends { id: string }>(records: T[]): T[] {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export class SourcingRepository {
  private readonly db = getCoreFirestore();
  private readonly sourceRunCollection = this.db.collection(sourcingCollections.sourceRuns);
  private readonly sourceRecordCollection = this.db.collection(sourcingCollections.sourceRecords);
  private readonly evidenceCollection = this.db.collection(sourcingCollections.evidence);
  private readonly dedupCandidateCollection = this.db.collection(sourcingCollections.dedupCandidates);
  private readonly reviewLabelCollection = this.db.collection(sourcingCollections.reviewLabels);
  private readonly approvedEntityCollection = this.db.collection(sourcingCollections.approvedEntities);
  private readonly enrichmentRunCollection = this.db.collection(sourcingCollections.enrichmentRuns);
  private readonly enrichmentReviewItemCollection = this.db.collection(sourcingCollections.enrichmentReviewItems);
  private readonly candidateProfileCollection = this.db.collection(sourcingCollections.candidateProfiles);
  private readonly vendorEnrichmentRunCollection = this.db.collection(sourcingCollections.vendorEnrichmentRuns);
  private readonly vendorProfileMatchCollection = this.db.collection(sourcingCollections.vendorProfileMatches);

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
    const snapshot = await this.sourceRecordCollection.where('sourceRunId', '==', runId).count().get();
    return snapshot.data().count;
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
    const snapshot = await this.evidenceCollection.where('sourceRunId', '==', runId).count().get();
    return snapshot.data().count;
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
    const snapshot = await this.dedupCandidateCollection.where('createdFromSourceRunId', '==', runId).count().get();
    return snapshot.data().count;
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

  async findApprovedEntitiesBySourceRecordIds(sourceRecordIds: string[]): Promise<ApprovedEntity[]> {
    if (sourceRecordIds.length === 0) {
      return [];
    }
    const snapshots = await Promise.all(
      chunks(sourceRecordIds, 10).map((ids) =>
        this.approvedEntityCollection.where('sourceRecordIds', 'array-contains-any', ids).get(),
      ),
    );
    return uniqueById(snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => doc.data() as ApprovedEntity)));
  }

  async findApprovedEntitiesByIdentityEvidenceHashes(identityEvidenceHashes: string[]): Promise<ApprovedEntity[]> {
    if (identityEvidenceHashes.length === 0) {
      return [];
    }
    const snapshots = await Promise.all(
      chunks(identityEvidenceHashes, 10).map((hashes) =>
        this.approvedEntityCollection.where('identityEvidenceHashes', 'array-contains-any', hashes).get(),
      ),
    );
    return uniqueById(snapshots.flatMap((snapshot) => snapshot.docs.map((doc) => doc.data() as ApprovedEntity)));
  }

  async listApprovedEntities(): Promise<ApprovedEntity[]> {
    const snapshot = await this.approvedEntityCollection.limit(200).get();
    return snapshot.docs
      .map((doc) => doc.data() as ApprovedEntity)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async getApprovedEntity(id: string): Promise<ApprovedEntity | null> {
    const snapshot = await this.approvedEntityCollection.doc(id).get();
    return snapshot.exists ? (snapshot.data() as ApprovedEntity) : null;
  }

  async getReviewLabelsByIds(ids: string[]): Promise<ReviewLabelRecord[]> {
    if (ids.length === 0) {
      return [];
    }
    const snapshots = await Promise.all(ids.map((id) => this.reviewLabelCollection.doc(id).get()));
    return snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => snapshot.data() as ReviewLabelRecord);
  }

  async createEnrichmentRun(run: CandidateEnrichmentRun): Promise<CandidateEnrichmentRun> {
    await this.enrichmentRunCollection.doc(run.id).set(run);
    return run;
  }

  async createEnrichmentReviewItem(item: CandidateEnrichmentReviewItem): Promise<CandidateEnrichmentReviewItem> {
    await this.enrichmentReviewItemCollection.doc(item.id).set(item);
    return item;
  }

  async getEnrichmentReviewItem(id: string): Promise<CandidateEnrichmentReviewItem | null> {
    const snapshot = await this.enrichmentReviewItemCollection.doc(id).get();
    return snapshot.exists ? (snapshot.data() as CandidateEnrichmentReviewItem) : null;
  }

  async listEnrichmentReviewItems(
    status?: CandidateEnrichmentReviewStatus,
  ): Promise<CandidateEnrichmentReviewItem[]> {
    const snapshot = status
      ? await this.enrichmentReviewItemCollection.where('status', '==', status).limit(200).get()
      : await this.enrichmentReviewItemCollection.limit(200).get();
    return snapshot.docs
      .map((doc) => doc.data() as CandidateEnrichmentReviewItem)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listEnrichmentReviewItemsForApprovedEntity(
    approvedEntityId: string,
  ): Promise<CandidateEnrichmentReviewItem[]> {
    const snapshot = await this.enrichmentReviewItemCollection
      .where('approvedEntityId', '==', approvedEntityId)
      .limit(50)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as CandidateEnrichmentReviewItem)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async updateEnrichmentReviewItem(item: CandidateEnrichmentReviewItem): Promise<CandidateEnrichmentReviewItem> {
    await this.enrichmentReviewItemCollection.doc(item.id).set(item);
    return item;
  }

  async upsertCandidateProfile(profile: CandidateProfile): Promise<CandidateProfile> {
    await this.candidateProfileCollection.doc(profile.id).set(profile);
    return profile;
  }

  async listCandidateProfiles(
    limit = 200,
    status?: CandidateProfile['status'],
  ): Promise<CandidateProfile[]> {
    const snapshot = status
      ? await this.candidateProfileCollection
        .where('status', '==', status)
        .limit(Math.max(1, Math.min(limit, 500)))
        .get()
      : await this.candidateProfileCollection
        .limit(Math.max(1, Math.min(limit, 500)))
        .get();
    return snapshot.docs
      .map((doc) => doc.data() as CandidateProfile)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getCandidateProfile(id: string): Promise<CandidateProfile | null> {
    const snapshot = await this.candidateProfileCollection.doc(id).get();
    return snapshot.exists ? (snapshot.data() as CandidateProfile) : null;
  }

  async getCandidateProfileByApprovedEntityId(approvedEntityId: string): Promise<CandidateProfile | null> {
    const snapshot = await this.candidateProfileCollection
      .where('approvedEntityId', '==', approvedEntityId)
      .where('status', '==', 'active')
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    return doc ? (doc.data() as CandidateProfile) : null;
  }

  async startVendorEnrichmentRun(run: VendorEnrichmentRun): Promise<{
    run: VendorEnrichmentRun;
    shouldCallProvider: boolean;
  }> {
    const ref = this.vendorEnrichmentRunCollection.doc(run.id);
    return this.db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (snapshot.exists) {
        const existing = snapshot.data() as VendorEnrichmentRun;
        if (existing.status !== 'failed') {
          return {
            run: existing,
            shouldCallProvider: false,
          };
        }
        const retried: VendorEnrichmentRun = {
          ...existing,
          status: 'running',
          snapshotId: null,
          matchIds: [],
          error: null,
          updatedAt: run.updatedAt,
        };
        transaction.set(ref, retried);
        return {
          run: retried,
          shouldCallProvider: true,
        };
      }
      transaction.set(ref, run);
      return {
        run,
        shouldCallProvider: true,
      };
    });
  }

  async getVendorEnrichmentRun(id: string): Promise<VendorEnrichmentRun | null> {
    const snapshot = await this.vendorEnrichmentRunCollection.doc(id).get();
    return snapshot.exists ? (snapshot.data() as VendorEnrichmentRun) : null;
  }

  async listVendorEnrichmentRunsForApprovedEntity(approvedEntityId: string): Promise<VendorEnrichmentRun[]> {
    const snapshot = await this.vendorEnrichmentRunCollection
      .where('approvedEntityId', '==', approvedEntityId)
      .limit(100)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as VendorEnrichmentRun)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listVendorEnrichmentRunsByInputHash(
    approvedEntityId: string,
    inputUrlHash: string,
  ): Promise<VendorEnrichmentRun[]> {
    const snapshot = await this.vendorEnrichmentRunCollection
      .where('approvedEntityId', '==', approvedEntityId)
      .where('inputUrlHash', '==', inputUrlHash)
      .limit(20)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as VendorEnrichmentRun)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async updateVendorEnrichmentRun(run: VendorEnrichmentRun): Promise<VendorEnrichmentRun> {
    await this.vendorEnrichmentRunCollection.doc(run.id).set(run);
    return run;
  }

  async upsertVendorProfileMatches(matches: VendorProfileMatch[]): Promise<VendorProfileMatch[]> {
    if (matches.length === 0) {
      return [];
    }
    const batch = this.db.batch();
    for (const match of matches) {
      batch.set(this.vendorProfileMatchCollection.doc(match.id), match);
    }
    await batch.commit();
    return matches;
  }

  async getVendorProfileMatch(id: string): Promise<VendorProfileMatch | null> {
    const snapshot = await this.vendorProfileMatchCollection.doc(id).get();
    return snapshot.exists ? (snapshot.data() as VendorProfileMatch) : null;
  }

  async getVendorProfileMatchesByIds(ids: string[]): Promise<VendorProfileMatch[]> {
    if (ids.length === 0) {
      return [];
    }
    const snapshots = await Promise.all(ids.map((id) => this.vendorProfileMatchCollection.doc(id).get()));
    return snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => snapshot.data() as VendorProfileMatch);
  }

  async listVendorProfileMatchesForApprovedEntity(approvedEntityId: string): Promise<VendorProfileMatch[]> {
    const snapshot = await this.vendorProfileMatchCollection
      .where('approvedEntityId', '==', approvedEntityId)
      .limit(100)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as VendorProfileMatch)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async listVendorProfileMatchesByInputHash(
    approvedEntityId: string,
    inputUrlHash: string,
  ): Promise<VendorProfileMatch[]> {
    const snapshot = await this.vendorProfileMatchCollection
      .where('approvedEntityId', '==', approvedEntityId)
      .where('inputUrlHash', '==', inputUrlHash)
      .limit(50)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as VendorProfileMatch)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async updateVendorProfileMatch(match: VendorProfileMatch): Promise<VendorProfileMatch> {
    await this.vendorProfileMatchCollection.doc(match.id).set(match);
    return match;
  }
}
