import { getCoreFirestore } from '../../../bootstrap/firebase';
import { matchingCollections } from '../../../shared/firestore/collections';
import type { MatchingSavedJobRecord } from '../domain/savedJob';

export class MatchingSavedJobRepository {
  private readonly collection = getCoreFirestore().collection(matchingCollections.savedJobs);

  async save(record: MatchingSavedJobRecord): Promise<void> {
    await this.collection.doc(record.id).set(record, { merge: true });
  }

  async remove(userId: string, jobId: string): Promise<void> {
    await this.collection.doc(`${userId}__${jobId}`).delete();
  }
}
