/**
 * Database setup script.
 * Reads SQL migrations and prints a combined SQL payload.
 *
 * Usage: npx tsx scripts/setup-db.ts
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const migrationsDir = resolve(__dirname, '../supabase/migrations');

try {
  const migrationFiles = readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  if (migrationFiles.length === 0) {
    throw new Error('No migration files found');
  }

  const sql = migrationFiles
    .map((file) => {
      const migrationPath = resolve(migrationsDir, file);
      const content = readFileSync(migrationPath, 'utf-8').trim();
      return `-- ===== ${file} =====\n${content}`;
    })
    .join('\n\n');

  console.log('='.repeat(60));
  console.log('AgentForge Database Setup');
  console.log('='.repeat(60));
  console.log();
  console.log('Migrations to apply (in order):');
  migrationFiles.forEach((file) => console.log(`  - ${file}`));
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
  console.error('Error reading migrations:', error);
  process.exit(1);
}
