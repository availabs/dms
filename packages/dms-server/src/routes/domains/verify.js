'use strict';

/**
 * DNS verification of a tenant's domain alias (tenant-external-domains.md, Phase B, 6).
 *
 * An alias serves once its owner has proved control of the domain AND pointed it at the hub:
 *
 *     TXT  _dms-verify.<domain>   "dms-verify=<token>"     the tenant's token (tokenFor): proves WHICH
 *                                                          tenant the domain's owner meant
 *     A    <domain>               one of the hub's IPs     traffic arrives
 *     A    *.<domain>             one of the hub's IPs     the tenant's pattern subdomains; checked
 *                                                          with a probe name, reported, not required
 *
 * The hub's IPs: DMS_DOMAIN_TARGET_IPS (comma list), else the root domain's own A records.
 * DMS_DOMAIN_DNS_SERVERS (comma list, `ip` or `ip:port`) points the lookups at other resolvers
 * (a test DNS server on a rig). Certificates and the front proxy are not the hub's (owner,
 * 2026-11-10): an alias is assumed to arrive with HTTPS in place.
 */
const crypto = require('crypto');
const dns = require('dns');

const TXT_PREFIX = '_dms-verify';
const WILDCARD_PROBE = 'dms-wildcard-check';
const PENDING_DAYS = 7;

// Hand mirror of the client's utils/hostResolver.js normalizeAliasDomain / aliasDomainProblem.
const normalize = (input) => `${input || ''}`.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0].split(':')[0].replace(/\.+$/, '');
function domainProblem(d, root) {
  if (!d) return 'Enter a domain.';
  if (d.length > 253 || !/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(d)) return 'Not a valid domain name.';
  if (/^[\d.]+$/.test(d)) return 'An IP address is not a domain.';
  if (d.startsWith('www.')) return 'Add the domain without www.';
  if (root && (d === root || d.endsWith(`.${root}`))) return `Domains under ${root} are the hub's own.`;
  if (d === 'localhost' || d.endsWith('.localhost')) return 'Not a public domain.';
  return '';
}

/** The tenant's verification token: stable, per hub and tenant row, not guessable without the secret. */
function tokenFor(hubApp, tenantId) {
  const secret = process.env.DMS_DOMAIN_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('no secret for domain tokens: set DMS_DOMAIN_TOKEN_SECRET or JWT_SECRET');
  return crypto.createHmac('sha256', secret).update(`dms-domain|${hubApp}|${tenantId}`).digest('hex').slice(0, 32);
}

function resolver() {
  const r = new dns.promises.Resolver({ timeout: 3000, tries: 2 });
  const servers = `${process.env.DMS_DOMAIN_DNS_SERVERS || ''}`.split(',').map(s => s.trim()).filter(Boolean);
  if (servers.length) r.setServers(servers);
  return r;
}

const NOT_FOUND = ['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ENONAME', 'NXDOMAIN'];
async function quiet(fn) {
  try { return await fn(); } catch (e) { if (NOT_FOUND.includes(e.code)) return []; throw e; }
}

/** The IPs an alias must point at. */
async function targetIps(rootDomain, r = resolver()) {
  const fixed = `${process.env.DMS_DOMAIN_TARGET_IPS || ''}`.split(',').map(s => s.trim()).filter(Boolean);
  if (fixed.length) return fixed;
  const a = await quiet(() => r.resolve4(rootDomain));
  if (a.length) return a;
  return (await quiet(() => dns.promises.lookup(rootDomain, { all: true, family: 4 }))).map(x => x.address);
}

/**
 * The records the tenant is asked to add, for the domains card. `name` relative to the domain (as
 * DNS providers ask for it), `host` in full. The wildcard may be a CNAME to the tenant's default
 * domain: the check resolves A through it.
 */
function recordsFor(domain, token, ips, defaultDomain) {
  return [
    { type: 'TXT', name: TXT_PREFIX, host: `${TXT_PREFIX}.${domain}`, value: `dms-verify=${token}` },
    ...ips.map(ip => ({ type: 'A', name: '@', host: domain, value: ip })),
    defaultDomain
      ? { type: 'CNAME', name: '*', host: `*.${domain}`, value: defaultDomain }
      : ips.map(ip => ({ type: 'A', name: '*', host: `*.${domain}`, value: ip })),
  ].flat();
}

/**
 * Look the domain up. Never throws for a missing record; a resolver failure (timeout, refused)
 * comes back as `problem` with nothing judged.
 */
async function checkDomain(domain, token, { ips, r = resolver() } = {}) {
  const out = { txt: false, a: false, wildcard: false, found: { txt: [], a: [], wildcard: [] }, problem: '' };
  try {
    const txt = (await quiet(() => r.resolveTxt(`${TXT_PREFIX}.${domain}`))).map(chunks => chunks.join(''));
    const a = await quiet(() => r.resolve4(domain));
    const w = await quiet(() => r.resolve4(`${WILDCARD_PROBE}.${domain}`));
    out.found = { txt, a, wildcard: w };
    out.txt = txt.includes(`dms-verify=${token}`);
    out.a = a.length > 0 && a.every(ip => ips.includes(ip));
    out.wildcard = w.length > 0 && w.every(ip => ips.includes(ip));
  } catch (e) {
    out.problem = `DNS lookup failed (${e.code || e.message}); try again`;
    return out;
  }
  const missing = [];
  if (!out.txt) missing.push(out.found.txt.length ? `the TXT record at ${TXT_PREFIX}.${domain} has a different value` : `no TXT record at ${TXT_PREFIX}.${domain}`);
  if (!out.a) missing.push(out.found.a.length ? `${domain} points at ${out.found.a.join(', ')}, not the hub` : `${domain} has no A record`);
  out.problem = missing.join('; ');
  return out;
}

/**
 * The alias after a check: verified once TXT and A both pass (and it stays verified: the TXT
 * proved control once; later checks only update what is shown). Pending otherwise.
 */
function applyCheck(alias, result, now = new Date()) {
  const at = now.toISOString();
  const next = {
    ...alias,
    checked_at: at,
    checks: { txt: result.txt, a: result.a, wildcard: result.wildcard },
    problem: result.problem || '',
  };
  if (result.txt && result.a && alias.status !== 'verified') { next.status = 'verified'; next.verified_at = at; }
  if (!next.status) next.status = 'pending';
  return next;
}

/** A pending alias older than PENDING_DAYS is dropped by the scheduled sweep. */
function expired(alias, now = Date.now()) {
  return alias.status !== 'verified' && alias.added_at && now - Date.parse(alias.added_at) > PENDING_DAYS * 86400e3;
}

module.exports = { normalize, domainProblem, tokenFor, targetIps, recordsFor, checkDomain, applyCheck, expired, TXT_PREFIX, WILDCARD_PROBE, PENDING_DAYS };
