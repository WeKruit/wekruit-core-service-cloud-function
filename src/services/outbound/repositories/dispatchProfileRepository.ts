import { getCoreFirestore } from '../../../bootstrap/firebase';
import { outboundCollections } from '../../../shared/firestore/collections';
import type { OutboundDispatchProfile } from '../domain/dispatch-profile';
import { randomUUID } from 'node:crypto';

export class OutboundDispatchProfileRepository {
  private readonly db = getCoreFirestore();
  private readonly collection = this.db.collection(outboundCollections.dispatchProfiles);

  async listProfiles(): Promise<OutboundDispatchProfile[]> {
    const snapshot = await this.collection.get();
    return snapshot.docs
      .map((doc) => doc.data() as OutboundDispatchProfile)
      .sort((left, right) => {
        if (left.isActive !== right.isActive) {
          return left.isActive ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
  }

  async listActiveProfiles(): Promise<OutboundDispatchProfile[]> {
    const snapshot = await this.collection.where('isActive', '==', true).get();
    return snapshot.docs
      .map((doc) => doc.data() as OutboundDispatchProfile)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async listActivePublicProfiles(): Promise<OutboundDispatchProfile[]> {
    const snapshot = await this.collection.where('isActive', '==', true).where('bookingAccessMode', '==', 'public').get();

    return snapshot.docs
      .map((doc) => doc.data() as OutboundDispatchProfile)
      .sort((left, right) => {
        if (left.publicSortOrder !== right.publicSortOrder) {
          return left.publicSortOrder - right.publicSortOrder;
        }
        return left.name.localeCompare(right.name);
      });
  }

  async getProfileBySlug(slug: string): Promise<OutboundDispatchProfile | null> {
    const snapshot = await this.collection.where('slug', '==', slug).limit(1).get();
    return snapshot.empty ? null : (snapshot.docs[0].data() as OutboundDispatchProfile);
  }

  async getActiveProfileBySlug(slug: string): Promise<OutboundDispatchProfile | null> {
    const profile = await this.getProfileBySlug(slug);
    return profile?.isActive ? profile : null;
  }

  async getActivePublicProfileBySlug(slug: string): Promise<OutboundDispatchProfile | null> {
    const profile = await this.getProfileBySlug(slug);
    if (!profile || !profile.isActive || profile.bookingAccessMode !== 'public') {
      return null;
    }
    return profile;
  }

  async createProfile(
    input: Omit<OutboundDispatchProfile, 'id' | 'createdAt' | 'updatedAt'>,
    now = new Date().toISOString(),
  ): Promise<OutboundDispatchProfile> {
    const existing = await this.getProfileBySlug(input.slug);
    if (existing) {
      throw new Error(`Dispatch profile slug "${input.slug}" already exists.`);
    }

    const profile: OutboundDispatchProfile = {
      id: randomUUID(),
      ...input,
      createdAt: now,
      updatedAt: now
    };

    await this.collection.doc(profile.id).set(profile);
    return profile;
  }

  async updateProfile(
    input: Omit<OutboundDispatchProfile, 'id' | 'createdAt' | 'updatedAt'> & { slug: string },
    now = new Date().toISOString(),
  ): Promise<OutboundDispatchProfile> {
    const existing = await this.getProfileBySlug(input.slug);
    if (!existing) {
      throw new Error(`Dispatch profile "${input.slug}" was not found after update.`);
    }

    const profile: OutboundDispatchProfile = {
      ...existing,
      ...input,
      updatedAt: now
    };

    await this.collection.doc(existing.id).set(profile);
    return profile;
  }
}
