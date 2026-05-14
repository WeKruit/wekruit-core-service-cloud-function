import { getCoreFirestore } from '../../../bootstrap/firebase';
import { matchingCollections } from '../../../shared/firestore/collections';
import type { MatchingFeedbackRecord } from '../domain/feedback';

export class MatchingFeedbackRepository {
  private readonly collection = getCoreFirestore().collection(matchingCollections.feedback);

  async listByUser(userId: string): Promise<MatchingFeedbackRecord[]> {
    const snapshot = await this.collection.where('userId', '==', userId).get();
    return snapshot.docs.map((doc) => doc.data() as MatchingFeedbackRecord);
  }

  async upsert(record: MatchingFeedbackRecord): Promise<void> {
    await this.collection.doc(record.id).set(record, { merge: true });
  }
}
