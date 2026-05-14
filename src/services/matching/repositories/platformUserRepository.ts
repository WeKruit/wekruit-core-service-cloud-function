import { getCoreFirestore } from '../../../bootstrap/firebase';
import { matchingCollections } from '../../../shared/firestore/collections';
import type { PlatformUserSyncRepository } from '../application/userSync';
import type { PlatformUserRecord, PlatformUserSyncState } from '../domain/platformUser';

export class PlatformUserRepository implements PlatformUserSyncRepository {
  private readonly collection = getCoreFirestore().collection(matchingCollections.platformUsers);

  async getById(uid: string): Promise<PlatformUserRecord | null> {
    const snapshot = await this.collection.doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }

    return snapshot.data() as PlatformUserRecord;
  }

  async getSyncState(uid: string): Promise<PlatformUserSyncState | null> {
    const snapshot = await this.collection.doc(uid).get();
    if (!snapshot.exists) {
      return null;
    }

    const data = snapshot.data() as Partial<PlatformUserRecord> | undefined;
    return {
      sourcePayloadHash: typeof data?.sourcePayloadHash === 'string' ? data.sourcePayloadHash : null,
    };
  }

  async upsert(record: PlatformUserRecord): Promise<void> {
    await this.collection.doc(record.uid).set(record, { merge: true });
  }
}
