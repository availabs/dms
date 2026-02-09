#!/usr/bin/env node

/**
 * DMS CLI - Command-line interface for DMS data management
 */

import { Command } from 'commander';
import { resolveConfig, validateConfig } from '../src/config.js';
import * as raw from '../src/commands/raw.js';
import * as site from '../src/commands/site.js';
import * as pattern from '../src/commands/pattern.js';
import * as page from '../src/commands/page.js';
import * as section from '../src/commands/section.js';
import * as dataset from '../src/commands/dataset.js';

const program = new Command();

program
  .name('dms')
  .description('Command-line interface for DMS data management')
  .version('0.1.0')
  .option('--host <url>', 'API host URL')
  .option('--app <name>', 'App namespace')
  .option('--type <type>', 'Site type identifier')
  .option('--auth-token <token>', 'Authentication token')
  .option('--format <fmt>', 'Output format: json, summary, tree', 'json')
  .option('--output <file>', 'Write output to file')
  .option('--pretty', 'Pretty-print JSON output')
  .option('--compact', 'Compact JSON output');

// Helper: --set collector (shared across update commands)
const collectSet = (val, prev) => prev ? [...prev, val] : [val];

// Helper to get merged config with CLI options
function getConfig(cmd) {
  const opts = cmd.optsWithGlobals();
  return resolveConfig({
    host: opts.host,
    app: opts.app,
    type: opts.type,
    authToken: opts.authToken,
  });
}

// Helper to get output options
function getOutputOptions(cmd) {
  const opts = cmd.optsWithGlobals();
  return {
    format: opts.format,
    output: opts.output,
    pretty: opts.pretty,
    compact: opts.compact,
  };
}

// ============================================================================
// RAW COMMANDS - Low-level data_items access
// ============================================================================

const rawCmd = program
  .command('raw')
  .description('Raw data_items access by id or app+type');

rawCmd
  .command('get <id>')
  .description('Get an item by ID')
  .option('--attrs <list>', 'Comma-separated list of attributes to fetch')
  .action(async (id, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config);
    await raw.get(id, config, { ...getOutputOptions(cmd), ...options });
  });

rawCmd
  .command('list <app+type>')
  .description('List items by app+type (e.g., "avail-dms+docs-page")')
  .option('--limit <n>', 'Maximum number of items', '20')
  .option('--offset <n>', 'Skip first n items', '0')
  .action(async (appType, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config);
    await raw.list(appType, config, { ...getOutputOptions(cmd), ...options });
  });

rawCmd
  .command('create <app> <type>')
  .description('Create a new item')
  .option('--data <json>', 'JSON data for the item')
  .action(async (app, type, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config);
    await raw.create(app, type, config, { ...getOutputOptions(cmd), ...options });
  });

rawCmd
  .command('update <id>')
  .description('Update an item')
  .option('--data <json>', 'JSON data (sent as-is for full replacement)')
  .option('--set <key=value>', 'Set a field with read-modify-write (repeatable)', collectSet)
  .action(async (id, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config);
    await raw.update(id, config, { ...getOutputOptions(cmd), ...options });
  });

rawCmd
  .command('delete <app> <type> <id>')
  .description('Delete an item')
  .action(async (app, type, id, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config);
    await raw.remove(app, type, id, config, { ...getOutputOptions(cmd), ...options });
  });

// ============================================================================
// SITE COMMANDS
// ============================================================================

const siteCmd = program
  .command('site')
  .description('Site information and management');

siteCmd
  .command('show')
  .description('Show site info (name, pattern count, theme refs)')
  .action(async (options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await site.show(config, getOutputOptions(cmd));
  });

siteCmd
  .command('patterns')
  .description('List patterns for this site')
  .action(async (options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await site.patterns(config, getOutputOptions(cmd));
  });

siteCmd
  .command('tree')
  .description('Show full site hierarchy (patterns → pages → sections, datasets)')
  .action(async (options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await site.tree(config, getOutputOptions(cmd));
  });

// ============================================================================
// PATTERN COMMANDS
// ============================================================================

const patternCmd = program
  .command('pattern')
  .description('Pattern listing and inspection');

patternCmd
  .command('list')
  .description('List all patterns')
  .action(async (options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await pattern.list(config, getOutputOptions(cmd));
  });

patternCmd
  .command('show <name-or-id>')
  .description('Show pattern details (by name or ID)')
  .action(async (nameOrId, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await pattern.show(nameOrId, config, getOutputOptions(cmd));
  });

patternCmd
  .command('dump <name-or-id>')
  .description('Dump full pattern data as JSON')
  .action(async (nameOrId, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await pattern.dump(nameOrId, config, getOutputOptions(cmd));
  });

// ============================================================================
// PAGE COMMANDS
// ============================================================================

const pageCmd = program
  .command('page')
  .description('Page CRUD and publishing');

pageCmd
  .command('list')
  .description('List pages')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .option('--published', 'Show only published pages')
  .option('--draft', 'Show only draft pages')
  .option('--limit <n>', 'Maximum number of items', '50')
  .option('--offset <n>', 'Skip first n items', '0')
  .action(async (options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await page.list(config, { ...getOutputOptions(cmd), ...options });
  });

pageCmd
  .command('show <id-or-slug>')
  .description('Show page metadata')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .action(async (idOrSlug, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await page.show(idOrSlug, config, { ...getOutputOptions(cmd), ...options });
  });

pageCmd
  .command('dump <id-or-slug>')
  .description('Dump full page data as JSON')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .option('--sections', 'Expand section data inline')
  .action(async (idOrSlug, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await page.dump(idOrSlug, config, { ...getOutputOptions(cmd), ...options });
  });

pageCmd
  .command('create')
  .description('Create a new page')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .option('--title <title>', 'Page title')
  .option('--slug <slug>', 'URL slug')
  .option('--parent <id>', 'Parent page ID')
  .option('--data <json>', 'Full JSON data')
  .action(async (options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await page.create(config, { ...getOutputOptions(cmd), ...options });
  });

pageCmd
  .command('update <id-or-slug>')
  .description('Update a page')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .option('--title <title>', 'New title (triggers read-modify-write)')
  .option('--slug <slug>', 'New URL slug (triggers read-modify-write)')
  .option('--data <json>', 'JSON data (sent as-is for full replacement)')
  .option('--set <key=value>', 'Set a field with read-modify-write (repeatable)', collectSet)
  .action(async (idOrSlug, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await page.update(idOrSlug, config, { ...getOutputOptions(cmd), ...options });
  });

pageCmd
  .command('publish <id-or-slug>')
  .description('Publish a page (copy draft_sections → sections)')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .action(async (idOrSlug, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await page.publish(idOrSlug, config, { ...getOutputOptions(cmd), ...options });
  });

pageCmd
  .command('unpublish <id-or-slug>')
  .description('Unpublish a page (set to draft)')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .action(async (idOrSlug, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await page.unpublish(idOrSlug, config, { ...getOutputOptions(cmd), ...options });
  });

pageCmd
  .command('delete <id-or-slug>')
  .description('Delete a page')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .action(async (idOrSlug, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await page.remove(idOrSlug, config, { ...getOutputOptions(cmd), ...options });
  });

// ============================================================================
// SECTION COMMANDS
// ============================================================================

const sectionCmd = program
  .command('section')
  .description('Section CRUD within pages');

sectionCmd
  .command('list <page-id-or-slug>')
  .description('List sections for a page')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .option('--draft', 'Show draft sections specifically')
  .action(async (pageIdOrSlug, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await section.list(pageIdOrSlug, config, { ...getOutputOptions(cmd), ...options });
  });

sectionCmd
  .command('show <section-id>')
  .description('Show section metadata')
  .action(async (sectionId, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config);
    await section.show(sectionId, config, getOutputOptions(cmd));
  });

sectionCmd
  .command('dump <section-id>')
  .description('Dump full section data as JSON')
  .action(async (sectionId, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config);
    await section.dump(sectionId, config, getOutputOptions(cmd));
  });

sectionCmd
  .command('create <page-id-or-slug>')
  .description('Create a section and attach to a page')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .option('--element-type <element-type>', 'Section element type (e.g., lexical, Card)')
  .option('--title <title>', 'Section title')
  .option('--level <level>', 'Section level')
  .option('--data <json>', 'Full JSON data')
  .action(async (pageIdOrSlug, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await section.create(pageIdOrSlug, config, { ...getOutputOptions(cmd), ...options });
  });

sectionCmd
  .command('update <section-id>')
  .description('Update a section')
  .option('--data <json>', 'JSON data (sent as-is for full replacement)')
  .option('--set <key=value>', 'Set a field with read-modify-write (repeatable)', collectSet)
  .action(async (sectionId, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config);
    await section.update(sectionId, config, { ...getOutputOptions(cmd), ...options });
  });

sectionCmd
  .command('delete <section-id>')
  .description('Delete a section')
  .option('--pattern <name-or-id>', 'Use a specific pattern for doc_type resolution')
  .option('--page <id-or-slug>', 'Also remove section ref from this page')
  .action(async (sectionId, options, cmd) => {
    const config = getConfig(cmd);
    if (options.page) {
      validateConfig(config, ['host', 'app', 'type']);
    } else {
      validateConfig(config);
    }
    await section.remove(sectionId, config, { ...getOutputOptions(cmd), ...options });
  });

// ============================================================================
// DATASET COMMANDS
// ============================================================================

const datasetCmd = program
  .command('dataset')
  .description('Dataset source CRUD and querying');

datasetCmd
  .command('list')
  .description('List dataset sources')
  .option('--pattern <name-or-id>', 'Use a specific pattern for type resolution')
  .option('--limit <n>', 'Maximum number of items', '50')
  .option('--offset <n>', 'Skip first n items', '0')
  .action(async (options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await dataset.list(config, { ...getOutputOptions(cmd), ...options });
  });

datasetCmd
  .command('show <id-or-name>')
  .description('Show dataset source details (by ID or name)')
  .option('--pattern <name-or-id>', 'Use a specific pattern for type resolution')
  .action(async (idOrName, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await dataset.show(idOrName, config, { ...getOutputOptions(cmd), ...options });
  });

datasetCmd
  .command('views <id-or-name>')
  .description('List views for a dataset source')
  .option('--pattern <name-or-id>', 'Use a specific pattern for type resolution')
  .action(async (idOrName, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await dataset.views(idOrName, config, { ...getOutputOptions(cmd), ...options });
  });

datasetCmd
  .command('dump <source-id>')
  .description('Dump data rows for a dataset source')
  .option('--pattern <name-or-id>', 'Use a specific pattern for type resolution')
  .option('--limit <n>', 'Maximum number of rows', '100')
  .option('--offset <n>', 'Skip first n rows', '0')
  .action(async (sourceId, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await dataset.dump(sourceId, config, { ...getOutputOptions(cmd), ...options });
  });

datasetCmd
  .command('query <source-id>')
  .description('Query dataset rows with filters and ordering')
  .option('--pattern <name-or-id>', 'Use a specific pattern for type resolution')
  .option('--filter <col=val>', 'Filter by column value (repeatable)', collectSet)
  .option('--order <col:asc|desc>', 'Order by column')
  .option('--limit <n>', 'Maximum number of rows', '100')
  .option('--offset <n>', 'Skip first n rows', '0')
  .action(async (sourceId, options, cmd) => {
    const config = getConfig(cmd);
    validateConfig(config, ['host', 'app', 'type']);
    await dataset.query(sourceId, config, { ...getOutputOptions(cmd), ...options });
  });

// Parse and run
program.parse();
