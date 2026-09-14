import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ────────────────────────────────────────────────────────────────────────────────
// CLI Args
// ────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

if (dryRun) {
  console.log('🔍 DRY RUN — no images will be generated or uploaded');
}
