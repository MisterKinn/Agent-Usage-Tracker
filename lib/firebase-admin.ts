import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env value: ${name}`);
  }
  return value;
}

function resolveStorageBucket() {
  const explicitBucket = process.env.FIREBASE_ADMIN_STORAGE_BUCKET?.trim();
  if (explicitBucket) {
    return explicitBucket;
  }

  const publicBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim();
  if (publicBucket) {
    if (publicBucket.endsWith(".firebasestorage.app")) {
      const projectId =
        process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
      if (projectId) {
        return `${projectId}.appspot.com`;
      }
    }
    return publicBucket;
  }

  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  return projectId ? `${projectId}.appspot.com` : undefined;
}

function adminApp() {
  if (getApps().length) {
    return getApps()[0];
  }

  return initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
    storageBucket: resolveStorageBucket(),
  });
}

export function adminDb() {
  return getFirestore(adminApp());
}

export function adminAuth() {
  return getAuth(adminApp());
}

export function adminStorage() {
  return getStorage(adminApp());
}
