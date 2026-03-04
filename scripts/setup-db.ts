/**
 * Database setup script.
 * Reads the SQL migration and provides instructions for applying it.
 *
 * Usage: npx tsx scripts/setup-db.ts
 *
 * This script outputs the SQL that needs to be run against your Supabase
 * database. You can copy-paste it into the Supabase SQL Editor, or use
 * the Supabase CLI to apply migrations.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

const migrationPath = resolve(__dirname, '../supabase/migrations/001_initial_schema.sql');

try {
  const sql = readFileSync(migrationPath, 'utf-8');

  console.log('='.repeat(60));
  console.log('AgentForge — Database Setup');
  console.log('='.repeat(60));
  console.log();
  console.log('To set up your database, run the following SQL in your');
  console.log('Supabase SQL Editor (https://supabase.com/dashboard):');
  console.log();
  console.log('-'.repeat(60));
  console.log(sql);
  console.log('-'.repeat(60));
  console.log();
  console.log('Or use the Supabase CLI:');
  console.log('  npx supabase db push');
  console.log();
  console.log('Make sure you have the following environment variables set:');
  console.log('  NEXT_PUBLIC_SUPABASE_URL');
  console.log('  NEXT_PUBLIC_SUPABASE_ANON_KEY');
  console.log('  SUPABASE_SERVICE_ROLE_KEY');
  console.log();
} catch (error) {
  console.error('Error reading migration file:', error);
  process.exit(1);
}
