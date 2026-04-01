import { getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

let firestoreInstance: Firestore | null = null;

export function initializeFirebaseAdmin() {
  if (getApps().length === 0) {
    initializeApp();
  }
}

export function getCoreFirestore() {
  initializeFirebaseAdmin();
  if (!firestoreInstance) {
    firestoreInstance = getFirestore();
    firestoreInstance.settings({ ignoreUndefinedProperties: true });
  }
  return firestoreInstance;
}
