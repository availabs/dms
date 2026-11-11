'use strict';

/**
 * A tenant's domain aliases on the hub (tenant-external-domains.md, Phase B).
 *
 *     GET  /domains/:tenant            the tenant's default domain, primary, aliases with their checks,
 *                                      and the DNS records to add
 *     POST /domains/:tenant/add        { domain }   a new alias, pending; checked at once
 *     POST /domains/:tenant/remove     { domain }   (the primary falls back to the default domain)
 *     POST /domains/:tenant/primary    { domain }   a verified alias of the tenant, or '' (the default)
 *     POST /domains/:tenant/check      { domain? }  look the alias (or all of them) up now
 *
 * `:tenant` is the tenant's subdomain. Who may: hub staff (`manage-tenants` on the hub's site row) or
 * the tenant's own admins (`manage-domains` on the TENANT's site row). The aliases live on the hub's
 * tenant row, which a tenant admin has no grants on, so these routes write it themselves
 * (store.writeTenant, through the DMS controller). A domain another tenant holds is refused as "in
 * use on this hub", never naming the tenant.
 *
 * Mounted only on the hub (multi-tenant with a root domain). A scheduled sweep re-checks pending
 * aliases hourly and drops one still unverified after PENDING_DAYS.
 */
const { requireUser } = require('../auth/requestUser');
const { siteCan } = require('../auth');
const { rootDomain } = require('../../utils/subdomain');
const store = require('./store');
const { tokenFor, targetIps, recordsFor, checkDomain, applyCheck, expired, normalize, domainProblem } = require('./verify');

const aliasesOf = (row) => (Array.isArray(row.data.aliases) ? row.data.aliases : []);

/** The tenant row and the caller, or null after answering 401 / 403 / 404. */
async function authorized(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  const row = await store.tenantBySubdomain(req.params.tenant, { fresh: true });
  if (!row) { res.status(404).json({ error: `no tenant "${req.params.tenant}"` }); return null; }
  const staff = await siteCan(store.hubApp(), user, ['manage-tenants']);
  if (!staff && !(row.data.app && await siteCan(row.data.app, user, ['manage-domains']))) {
    res.status(403).json({ error: 'Not authorized: needs manage-domains on this site' });
    return null;
  }
  return { user, row, staff };
}

async function describe(row, staff) {
  const root = rootDomain();
  const token = tokenFor(store.hubApp(), row.id);
  const ips = await targetIps(root).catch(() => []);
  return {
    tenant: { id: row.id, name: row.data.name, subdomain: row.data.subdomain, app: row.data.app },
    staff,
    defaultDomain: `${row.data.subdomain}.${root}`,
    primary: row.data.primary || '',
    token,
    ips,
    aliases: aliasesOf(row).map(a => ({ ...a, records: recordsFor(a.domain, token, ips, `${row.data.subdomain}.${root}`) })),
  };
}

// One write at a time per tenant row: each is a read-modify-write of the `aliases` list.
const queues = new Map();
function serial(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(key, next.finally(() => { if (queues.get(key) === next) queues.delete(key); }));
  return next;
}

async function checked(row, alias) {
  const ips = await targetIps(rootDomain());
  const result = await checkDomain(alias.domain, tokenFor(store.hubApp(), row.id), { ips });
  return applyCheck(alias, result);
}

function handler(fn) {
  return async (req, res) => {
    try {
      const who = await authorized(req, res);
      if (!who) return;
      await fn(req, res, who);
    } catch (e) {
      console.error('[domains]', e.message);
      if (!res.headersSent) res.status(500).json({ error: e.message });
    }
  };
}

/** Change the tenant's row under its queue, then answer with the fresh description. */
function change(mutate) {
  return handler(async (req, res, { user, row, staff }) => {
    const out = await serial(row.id, async () => {
      const current = await store.tenantBySubdomain(row.data.subdomain, { fresh: true });
      const patch = await mutate(req, current);
      if (patch.error) return patch;
      await store.writeTenant(current, patch, user);
      return { row: await store.tenantBySubdomain(row.data.subdomain) };
    });
    if (out.error) return res.status(out.status || 400).json({ error: out.error });
    res.json(await describe(out.row, staff));
  });
}

function registerDomainRoutes(app) {
  if (!rootDomain()) return;
  store.start();

  app.get('/domains/:tenant', handler(async (req, res, { row, staff }) => res.json(await describe(row, staff))));

  app.post('/domains/:tenant/add', change(async (req, row) => {
    const domain = normalize(req.body && req.body.domain);
    const problem = domainProblem(domain, rootDomain());
    if (problem) return { error: problem };
    if (aliasesOf(row).some(a => a.domain === domain)) return { error: `${domain} is already on this site` };
    const all = await store.tenants({ fresh: true });
    if (all.some(t => t.id !== row.id && aliasesOf(t).some(a => a.domain === domain))) {
      return { error: `${domain} is in use on this hub`, status: 409 };
    }
    const alias = await checked(row, { domain, status: 'pending', added_at: new Date().toISOString() });
    return { aliases: [...aliasesOf(row), alias] };
  }));

  app.post('/domains/:tenant/remove', change(async (req, row) => {
    const domain = normalize(req.body && req.body.domain);
    if (!aliasesOf(row).some(a => a.domain === domain)) return { error: `${domain} is not on this site`, status: 404 };
    const patch = { aliases: aliasesOf(row).filter(a => a.domain !== domain) };
    if (row.data.primary === domain) patch.primary = '';
    return patch;
  }));

  app.post('/domains/:tenant/primary', change(async (req, row) => {
    const domain = normalize(req.body && req.body.domain);
    if (domain && domain === `${row.data.subdomain}.${rootDomain()}`) return { primary: '' };
    if (domain && !aliasesOf(row).some(a => a.domain === domain && a.status === store.VERIFIED)) {
      return { error: `${domain} is not a verified domain of this site` };
    }
    return { primary: domain };
  }));

  app.post('/domains/:tenant/check', change(async (req, row) => {
    const domain = normalize(req.body && req.body.domain);
    const list = aliasesOf(row);
    if (domain && !list.some(a => a.domain === domain)) return { error: `${domain} is not on this site`, status: 404 };
    const aliases = [];
    for (const a of list) aliases.push(!domain || a.domain === domain ? await checked(row, a) : a);
    return { aliases };
  }));

  const sweep = setInterval(() => sweepPending().catch(e => console.warn('[domains] sweep failed:', e.message)), 60 * 60 * 1000);
  sweep.unref();
}

/** Re-check every pending alias; drop the ones past PENDING_DAYS. A verified alias is left alone. */
async function sweepPending() {
  for (const row of await store.tenants({ fresh: true })) {
    const list = aliasesOf(row);
    if (!list.some(a => a.status !== store.VERIFIED)) continue;
    await serial(row.id, async () => {
      const current = await store.tenantBySubdomain(row.data.subdomain, { fresh: true });
      if (!current) return;
      const aliases = [];
      for (const a of aliasesOf(current)) {
        if (a.status === store.VERIFIED) aliases.push(a);
        else if (expired(a)) console.log(`[domains] ${current.data.subdomain}: dropped ${a.domain}, unverified after the grace period`);
        else aliases.push(await checked(current, a));
      }
      const patch = { aliases };
      if (current.data.primary && !aliases.some(a => a.domain === current.data.primary)) patch.primary = '';
      await store.writeTenant(current, patch, null);
    });
  }
}

module.exports = { registerDomainRoutes, sweepPending };
