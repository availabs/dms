// A run's settings: a config file (--config), then flags over it, then defaults.
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  label: 'run',
  target: null,            // origin the pages are loaded from, e.g. http://mny.localhost:5555
  pattern: null,           // the pattern to walk (name or id); the site comes from the CLI's connection
  profiles: ['public'],
  visits: ['warm', 'click', 'journey'],   // 'cold' (a new profile per page) is opt-in: it is the slow one
  runs: 5,
  sample: null,            // N pages spread across the pattern; null = every published page
  pages: null,             // explicit slugs
  pagesFrom: null,         // reuse a saved run's page list and journey
  journeySteps: 8,
  quietMs: 1000,           // how long the page must be quiet to count as complete
  timeoutMs: 60000,
  viewport: { width: 1366, height: 900 },
  out: null,               // default: scratchpad/<app>-<type>/perf/<date>-<label>
};

// what a visitor is, per profile. Signed-in and throttled profiles come in a later phase.
export const PROFILES = {
  public: { signedIn: false, cpu: 1, network: null },
};

const list = (v) => (v == null ? null : Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean));

export function resolveRunConfig(options = {}) {
  const file = options.config ? JSON.parse(fs.readFileSync(path.resolve(options.config), 'utf8')) : {};
  const flags = {
    label: options.label, target: options.target, pattern: options.pattern,
    profiles: list(options.profiles), visits: list(options.visits), pages: list(options.pages),
    runs: options.runs != null ? +options.runs : undefined,
    sample: options.sample != null ? +options.sample : undefined,
    journeySteps: options.journeySteps != null ? +options.journeySteps : undefined,
    quietMs: options.quietMs != null ? +options.quietMs : undefined,
    timeoutMs: options.timeout != null ? +options.timeout * 1000 : undefined,
    pagesFrom: options.pagesFrom, out: options.out,
  };
  const cfg = { ...DEFAULTS, ...file };
  for (const [k, v] of Object.entries(flags)) if (v !== undefined && v !== null) cfg[k] = v;
  if (!cfg.target) throw new Error('No target: pass --target <origin> (e.g. http://mny.localhost:5555) or set "target" in the config file');
  cfg.target = cfg.target.replace(/\/+$/, '');
  for (const p of cfg.profiles) if (!PROFILES[p]) throw new Error(`Unknown profile "${p}" (have: ${Object.keys(PROFILES).join(', ')})`);
  const known = ['cold', 'warm', 'click', 'journey'];
  for (const v of cfg.visits) if (!known.includes(v)) throw new Error(`Unknown visit type "${v}" (have: ${known.join(', ')})`);
  if (!(cfg.runs >= 1)) throw new Error('--runs must be 1 or more');
  return cfg;
}
