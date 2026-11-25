/* global process */
// `dms perf …`: the CLI loads this module from a `.dmsrc` (`commands`) and passes its own helpers.
// The site comes from the CLI's connection (--host/--app/--type, DMS_* variables); the pages are
// loaded from --target, which is the address a visitor uses.
import path from 'node:path';
import { execSync } from 'node:child_process';
import { resolveRunConfig } from './config.js';
import { listPages, choosePages } from './pages.js';

const repoRoot = () => {
  try { return execSync('git rev-parse --show-superproject-working-tree --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[0]; }
  catch { return process.cwd(); }
};

export default function register({ program, helpers }) {
  const { getConfig, validateConfig, makeClient, outputError } = helpers;
  const log = (m) => process.stderr.write(m + '\n');
  const guard = (fn) => async (...args) => {
    try { await fn(...args); } catch (error) { outputError(error); process.exitCode = 1; }
  };

  const perf = program.command('perf').description('Performance test: load every page of a pattern cold, warm and by an in-app click; compare saved runs');

  perf.command('run')
    .description('Measure a pattern on a target and save the run')
    .requiredOption('--pattern <name-or-id>', 'The pattern whose pages are visited')
    .option('--target <origin>', 'Where the pages are loaded from, e.g. http://mny.localhost:5555')
    .option('--config <file>', 'A JSON run config; flags override it')
    .option('--label <name>', 'A name for this run (part of its folder name)')
    .option('--runs <n>', 'Repetitions of every visit (default 5)')
    .option('--parallel <n>', 'Browsers measuring at once (default 3); 1 for numbers no other page competed with')
    .option('--sample <n>', 'Visit n pages spread across the pattern instead of all of them')
    .option('--pages <slugs>', 'Visit these pages only (comma-separated slugs)')
    .option('--pages-from <run-dir>', "Visit the same pages and journey as a saved run")
    .option('--visits <types>', 'cold,warm,click,journey (default: all four)')
    .option('--profiles <names>', 'public,signed_in (default: public). signed_in signs in with DMS_PERF_EMAIL / DMS_PERF_PASSWORD (else DMS_EMAIL / DMS_PASSWORD)')
    .option('--login-path <path>', "The target's sign-in page, for signed-in profiles (default /auth/login)")
    .option('--journey-steps <n>', 'In-app clicks in the journey (default 8)')
    .option('--quiet-ms <ms>', 'How long a page must be quiet to count as complete (default 1000)')
    .option('--timeout <seconds>', 'Give up on one page after this long (default 60)')
    .option('--out <dir>', 'Where to save the run (default: scratchpad/<site>/perf/<date>-<label>)')
    .option('--no-report', "Don't write the HTML report")
    .action(guard(async (options, cmd) => {
      const connection = getConfig(cmd);
      validateConfig(connection, ['host', 'app', 'type']);
      const cfg = resolveRunConfig(options);
      const root = repoRoot();
      const { loadRun, runPerf } = await import('./runner.mjs');
      const falcor = makeClient(connection);
      const { pattern, pages: allPages } = await listPages(falcor, connection, cfg.pattern);
      let pages;
      if (cfg.pagesFrom) {
        const saved = loadRun(cfg.pagesFrom).run.pages.map((p) => p.slug);
        pages = choosePages(allPages, { pages: saved.filter((s) => allPages.some((p) => p.slug === s)) });
      } else pages = choosePages(allPages, cfg);
      if (!pages.length) throw new Error(`Pattern ${pattern.name} has no published pages to visit`);
      log(`${pattern.name}: ${pages.length} of ${allPages.filter((p) => p.published).length} published pages · ${cfg.runs} run(s) · ${cfg.parallel} at a time · ${cfg.visits.join(', ')} · ${cfg.target}`);
      const { outDir, run } = await runPerf(cfg, { pattern, pages, allPages, repoRoot: root, connection: { host: connection.host, app: connection.app, type: connection.type } }, log);
      log(`saved ${run.counts.visits} visits to ${outDir}`);
      if (options.report !== false) {
        const { writeReport } = await import('./report/index.mjs');
        log(`report: ${writeReport([loadRun(outDir)], path.join(outDir, 'report.html'))}`);
      }
      process.stdout.write(outDir + '\n');
    }));

  perf.command('report <run-dir>')
    .description("Write a saved run's HTML report again")
    .option('--out <file>', 'The report file (default: <run-dir>/report.html)')
    .action(guard(async (dir, options) => {
      const { loadRun } = await import('./runner.mjs');
      const { writeReport } = await import('./report/index.mjs');
      process.stdout.write(writeReport([loadRun(dir)], options.out || path.join(path.resolve(dir), 'report.html')) + '\n');
    }));

  perf.command('compare <baseline-dir> <candidate-dir>')
    .description('Compare two saved runs: what moved by more than the noise')
    .option('--out <file>', 'The comparison report (default: <candidate-dir>/compare-<baseline label>.html)')
    .option('--json', 'Print the comparison as JSON instead of a summary')
    .action(guard(async (a, b, options) => {
      const { loadRun } = await import('./runner.mjs');
      const { compareRuns, compareSummaryText } = await import('./compare.mjs');
      const { writeReport } = await import('./report/index.mjs');
      const base = loadRun(a), cand = loadRun(b);
      const cmp = compareRuns(base, cand);
      const out = options.out || path.join(cand.dir, `compare-${base.run.label}.html`.replace(/[^\w.-]+/g, '_'));
      writeReport([base, cand], out, cmp);
      process.stdout.write(options.json ? JSON.stringify(cmp, null, 1) + '\n' : compareSummaryText(cmp) + `\nreport: ${out}\n`);
    }));
}
