// Seed script for Waslha challenges (single source of truth = functions/challenges-data.js).
// Run ONCE after deploying the functions (needs a Firebase service account):
//
//   set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccountKey.json
//   set FIREBASE_PROJECT_ID=waslha-97c1e
//   node tools/seedChallenges.mjs
//
// It writes the PUBLIC challenge data into /challenges and the SECRET correct
// answer index into /challengeSecrets (never readable by the frontend).
//
// NOTE: You don't strictly need this script — the Cloud Functions auto-seed the
// same dataset server-side on the first game start. This script only lets you
// seed manually ahead of time using a Service Account.

import { createRequire } from 'module';
import admin from 'firebase-admin';

const require = createRequire(import.meta.url);
const { CHALLENGES } = require('../functions/challenges-data.js');

const app = admin.initializeApp({
  projectId: process.env.FIREBASE_PROJECT_ID || 'waslha-97c1e',
  credential: admin.credential.applicationDefault(),
});

const db = app.firestore();

async function seed() {
  const batch = db.batch();
  for (const c of CHALLENGES) {
    const { correctIndex, ...publicData } = c;
    // Deterministic IDs + set = idempotent, never creates duplicates on re-run.
    batch.set(db.collection('challenges').doc(c.id), {
      ...publicData,
      active: true,
    });
    batch.set(db.collection('challengeSecrets').doc(c.id), { correctIndex });
  }
  await batch.commit();
  console.log(`✅ تمت إضافة ${CHALLENGES.length} تحديات.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ فشل الـseed:', err.message);
  process.exit(1);
});

