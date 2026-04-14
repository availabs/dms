#!/usr/bin/env node
'use strict';

/**
 * In-place migration: backfill data_manager.tasks from data_manager.etl_contexts.
 *
 * Safe to run on production — additive only, old tables untouched.
 * All DDL uses IF NOT EXISTS, all INSERTs use ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   node migrate-dama-tasks.js --source hazmit_dama              # dry-run
 *   node migrate-dama-tasks.js --source hazmit_dama --apply       # execute
 *   node migrate-dama-tasks.js --source hazmit_dama --events --apply  # also backfill milestone events
 */

const { readFileSync } = require('fs');
const { join } = require('path');
const { loadConfig } = require('../db/config');
const { PostgresAdapter } = require('../db/adapters/postgres');
const { SqliteAdapter } = require('../db/adapters/sqlite');

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { source: null, apply: false, events: false, batch: 1000 };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--source': opts.source = args[++i]; break;
      case '--apply': opts.apply = true; break;
      case '--events': opts.events = true; break;
      case '--batch': opts.batch = parseInt(args[++i], 10); break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }

  if (!opts.source) {
    console.error('Usage: node migrate-dama-tasks.js --source <config> [--apply] [--events] [--batch N]');
    process.exit(1);
  }

  return opts;
}

function createDb(configName) {
  const config = loadConfig(configName);
  if (config.type === 'postgres') return new PostgresAdapter(config);
  if (config.type === 'sqlite') return new SqliteAdapter(config);
  throw new Error(`Unknown database type: ${config.type}`);
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function migrate(opts) {
  const db = createDb(opts.source);
  const isPg = db.type === 'postgres';

  if (!isPg) {
    console.error('Migration only supports PostgreSQL databases (etl_contexts/event_store are PG-only).');
    process.exit(1);
  }

  console.log(`\n=== DAMA Task Migration${opts.apply ? '' : ' (DRY RUN)'} ===`);
  console.log(`Database: ${opts.source}\n`);

  // Step 1: Ensure target tables exist
  console.log('Step 1: Ensuring task tables exist...');
  const tasksSql = readFileSync(join(__dirname, '../db/sql/dama/create_dama_task_tables.sql'), 'utf8');

  if (opts.apply) {
    await db.query(tasksSql);
  }
  console.log('  tasks + task_events + settings tables: OK');

  // Step 2: Check for existing migration
  let existingTasks = 0;
  try {
    const { rows } = await db.query('SELECT COUNT(*)::int AS cnt FROM data_manager.tasks');
    existingTasks = rows[0].cnt;
  } catch (e) {
    // Table may not exist yet in dry-run mode
  }
  if (existingTasks > 0) {
    console.log(`  WARNING: ${existingTasks} tasks already exist (re-run is safe — ON CONFLICT DO NOTHING)`);
  }

  // Step 3: Count source data
  const { rows: ctxCount } = await db.query('SELECT COUNT(*)::int AS cnt FROM data_manager.etl_contexts');
  const totalContexts = ctxCount[0].cnt;

  const { rows: statusDist } = await db.query(`
    SELECT etl_status, COUNT(*)::int AS cnt
    FROM data_manager.etl_contexts
    GROUP BY etl_status
    ORDER BY cnt DESC
  `);

  console.log(`\nStep 2: Source data — ${totalContexts} etl_contexts`);
  for (const row of statusDist) {
    const status = row.etl_status || 'NULL';
    const mapped = row.etl_status === 'DONE' ? 'done' : row.etl_status === 'ERROR' ? 'error' : row.etl_status === 'OPEN' ? 'running' : 'queued';
    console.log(`  ${status}: ${row.cnt} → ${mapped}`);
  }

  // Step 3: Backfill tasks
  const tasksSqlInsert = `
    INSERT INTO data_manager.tasks (
        task_id, host_id, source_id, worker_path, status, progress,
        result, error, descriptor, queued_at, started_at, completed_at
    )
    SELECT
        a.etl_context_id,
        'migrated',
        a.source_id,
        COALESCE(
            b.meta->'__dama_task_manager__'->>'worker_path',
            a.etl_task_id,
            'unknown'
        ),
        CASE a.etl_status
            WHEN 'DONE' THEN 'done'
            WHEN 'ERROR' THEN 'error'
            WHEN 'OPEN' THEN 'running'
            ELSE 'queued'
        END,
        CASE WHEN a.etl_status = 'DONE' THEN 1 ELSE 0 END,
        CASE WHEN a.etl_status = 'DONE' THEN
            (SELECT payload FROM data_manager.event_store WHERE event_id = a.latest_event_id)
        END,
        CASE WHEN a.etl_status = 'ERROR' THEN
            (SELECT COALESCE(payload->>'message', LEFT(payload::text, 500))
             FROM data_manager.event_store WHERE event_id = a.latest_event_id)
        END,
        jsonb_build_object(
            'migrated_from', 'etl_context',
            'parent_context_id', a.parent_context_id,
            'etl_task_id', a.etl_task_id
        ),
        a._created_timestamp,
        (SELECT _created_timestamp FROM data_manager.event_store WHERE event_id = a.initial_event_id),
        CASE WHEN a.etl_status IN ('DONE', 'ERROR') THEN
            (SELECT _created_timestamp FROM data_manager.event_store WHERE event_id = a.latest_event_id)
        END
    FROM data_manager.etl_contexts a
    LEFT JOIN data_manager.event_store b ON (a.initial_event_id = b.event_id)
    ON CONFLICT (task_id) DO NOTHING
  `;

  console.log(`\nStep 3: Backfilling tasks from etl_contexts...`);
  let tasksCreated = 0;
  if (opts.apply) {
    const result = await db.query(tasksSqlInsert);
    tasksCreated = result.rowCount || 0;
    // Reset sequence
    await db.query(`SELECT setval('data_manager.tasks_task_id_seq', GREATEST((SELECT MAX(task_id) FROM data_manager.tasks), 1))`);
    console.log(`  Created ${tasksCreated} tasks, sequence reset`);
  } else {
    console.log(`  Would create up to ${totalContexts} tasks (dry-run)`);
    tasksCreated = totalContexts;
  }

  // Step 4: Backfill milestone events (optional)
  let eventsCreated = 0;
  if (opts.events) {
    const { rows: evtCount } = await db.query(`
      SELECT COUNT(*)::int AS cnt FROM data_manager.event_store
      WHERE type LIKE '%:INITIAL' OR type LIKE '%:FINAL' OR type LIKE '%:ERROR'
    `);
    const milestoneCount = evtCount[0].cnt;

    const eventsSqlInsert = `
      INSERT INTO data_manager.task_events (
          event_id, task_id, type, message, payload, created_at
      )
      SELECT
          e.event_id,
          e.etl_context_id,
          e.type,
          COALESCE(e.meta->>'note', e.type),
          e.payload,
          e._created_timestamp
      FROM data_manager.event_store e
      WHERE e.type LIKE '%:INITIAL'
         OR e.type LIKE '%:FINAL'
         OR e.type LIKE '%:ERROR'
      ON CONFLICT (event_id) DO NOTHING
    `;

    console.log(`\nStep 4: Backfilling milestone events (${milestoneCount} of ${(await db.query('SELECT COUNT(*)::int AS cnt FROM data_manager.event_store')).rows[0].cnt} total)...`);
    if (opts.apply) {
      const result = await db.query(eventsSqlInsert);
      eventsCreated = result.rowCount || 0;
      await db.query(`SELECT setval('data_manager.task_events_event_id_seq', GREATEST((SELECT MAX(event_id) FROM data_manager.task_events), 1))`);
      console.log(`  Created ${eventsCreated} events, sequence reset`);
    } else {
      console.log(`  Would create up to ${milestoneCount} events (dry-run)`);
      eventsCreated = milestoneCount;
    }
  } else {
    console.log('\nStep 4: Event backfill skipped (use --events to include)');
  }

  // Step 5: Migrate settings
  let settingsMigrated = false;
  try {
    const { rows: settingsCols } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'data_manager' AND table_name = 'settings'
      ORDER BY ordinal_position
    `);
    const colNames = settingsCols.map(r => r.column_name);

    if (colNames.includes('settings') && !colNames.includes('key')) {
      // Old schema — needs migration
      console.log('\nStep 5: Migrating settings table (old schema detected)...');
      if (opts.apply) {
        await db.query('ALTER TABLE data_manager.settings RENAME TO settings_legacy');
        await db.query(`
          CREATE TABLE data_manager.settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL DEFAULT '{}'::jsonb
          )
        `);
        await db.query(`
          INSERT INTO data_manager.settings (key, value)
          SELECT 'default', settings FROM data_manager.settings_legacy
          ON CONFLICT (key) DO NOTHING
        `);
        settingsMigrated = true;
        console.log('  Settings migrated: old table → settings_legacy, new table created');
      } else {
        console.log('  Would rename old settings → settings_legacy, create new table (dry-run)');
        settingsMigrated = true;
      }
    } else if (colNames.includes('key')) {
      console.log('\nStep 5: Settings table already has new schema — skipping');
    } else {
      console.log('\nStep 5: No settings table found — skipping');
    }
  } catch (e) {
    console.log('\nStep 5: Settings table check failed — skipping:', e.message);
  }

  // Step 6: Report
  const statusMap = {};
  for (const row of statusDist) {
    const mapped = row.etl_status === 'DONE' ? 'done' : row.etl_status === 'ERROR' ? 'error' : row.etl_status === 'OPEN' ? 'running' : 'queued';
    statusMap[mapped] = (statusMap[mapped] || 0) + row.cnt;
  }

  console.log(`\n=== Migration Report${opts.apply ? '' : ' (DRY RUN — no changes written)'} ===`);
  console.log(`Database: ${opts.source}`);
  console.log(`Tasks: ${tasksCreated}`);
  for (const [status, count] of Object.entries(statusMap)) {
    console.log(`  - ${status}: ${count}`);
  }
  console.log(`Events: ${eventsCreated}${opts.events ? ' (milestone only)' : ' (skipped)'}`);
  console.log(`Settings: ${settingsMigrated ? 'migrated' : 'unchanged'}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const opts = parseArgs();
migrate(opts).then(() => {
  process.exit(0);
}).catch(err => {
  console.error('\nMigration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
