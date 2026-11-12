/**
 * Tenant domain aliases (tenant-external-domains.md, Phase B): the host resolver's alias step,
 * DNS verification logic, the primary-domain redirect and the store's alias map. No database and
 * no network: DNS is a fake resolver.
 *
 *     node tests/test-tenant-domains.js
 */
const assert = require('assert');

process.env.DMS_MULTI_TENANT = '1';
process.env.DMS_ROOT_DOMAIN = 'availabs.com';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { resolveHost, getSubdomain, setDomainAliasMap, primaryDomainOf } = require('../src/utils/subdomain');
const { resolvePrimaryRedirect } = require('../src/utils/primaryRedirect');
const { aliasMapOf } = require('../src/routes/domains/store');
const verify = require('../src/routes/domains/verify');

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.stack}`); process.exitCode = 1; }
}

const TENANTS = [
  { id: 1, data: { subdomain: 'mny', primary: 'devmny.org', aliases: [{ domain: 'devmny.org', status: 'verified' }, { domain: 'mitigateny.org', status: 'pending' }] } },
  { id: 2, data: { subdomain: 'tny', aliases: [{ domain: 'transportny.org', status: 'verified' }, { domain: 'npmrds.transportny.org', status: 'verified' }] } },
  { id: 3, data: { subdomain: 'zz', primary: 'devmny.org', aliases: [{ domain: 'devmny.org', status: 'verified' }] } },
];

(async () => {
  console.log('tenant domains');

  await test('aliasMapOf: verified only, first claim wins, primary must be its own', () => {
    const { aliases, primary } = aliasMapOf(TENANTS);
    assert.deepStrictEqual([...aliases], [['devmny.org', 'mny'], ['transportny.org', 'tny'], ['npmrds.transportny.org', 'tny']]);
    assert.deepStrictEqual([...primary], [['mny', 'devmny.org']]);
  });

  setDomainAliasMap(aliasMapOf(TENANTS));

  await test('resolveHost: aliases, longest match, root-domain hosts unchanged', () => {
    assert.deepStrictEqual(resolveHost('albany.devmny.org', 'availabs.com'), { tenant: 'mny', patternSubdomain: 'albany', alias: 'devmny.org' });
    assert.deepStrictEqual(resolveHost('devmny.org:443', 'availabs.com'), { tenant: 'mny', patternSubdomain: '', alias: 'devmny.org' });
    assert.strictEqual(resolveHost('npmrds.transportny.org', 'availabs.com').alias, 'npmrds.transportny.org');
    assert.strictEqual(resolveHost('mitigateny.org', 'availabs.com'), null);
    assert.strictEqual(resolveHost('xdevmny.org', 'availabs.com'), null);
    assert.deepStrictEqual(resolveHost('albany.mny.availabs.com', 'availabs.com'), { tenant: 'mny', patternSubdomain: 'albany' });
    assert.strictEqual(resolveHost('devmny.org', ''), null);
  });

  await test('getSubdomain reads the pattern subdomain on an alias origin', () => {
    assert.strictEqual(getSubdomain({ headers: { origin: 'https://albany.devmny.org' } }), 'albany');
    assert.strictEqual(getSubdomain({ headers: { origin: 'https://devmny.org' } }), '');
    // not an alias: the legacy single-label reading, as before
    assert.strictEqual(getSubdomain({ headers: { origin: 'https://npmrds.devtny.org' } }), 'npmrds');
    assert.strictEqual(primaryDomainOf('mny'), 'devmny.org');
  });

  await test('primary redirect', () => {
    const go = (host, pathname = '/') => resolvePrimaryRedirect({ host, pathname, search: '?q=1' });
    assert.strictEqual(go('mny.availabs.com', '/x'), 'https://devmny.org/x?q=1');
    assert.strictEqual(go('albany.mny.availabs.com', '/p'), 'https://albany.devmny.org/p?q=1');
    assert.strictEqual(go('devmny.org'), null);
    assert.strictEqual(go('mny.availabs.com', '/list/domains'), null);
    assert.strictEqual(go('mny.availabs.com', '/.well-known/x'), null);
    assert.strictEqual(go('tny.availabs.com'), null);
    assert.strictEqual(go('availabs.com'), null);
    // www dropped: to the primary, else the same alias or default domain; the root's www is nginx's
    assert.strictEqual(go('www.devmny.org', '/x'), 'https://devmny.org/x?q=1');
    assert.strictEqual(go('www.mny.availabs.com', '/list'), null);
    assert.strictEqual(go('www.tny.availabs.com', '/list'), 'https://tny.availabs.com/list?q=1');
    assert.strictEqual(go('www.availabs.com'), null);
    assert.strictEqual(go('www.albany.devmny.org', '/p'), 'https://albany.devmny.org/p?q=1');
    assert.strictEqual(go('www.npmrds.tny.availabs.com'), 'https://npmrds.tny.availabs.com/?q=1');
    assert.strictEqual(resolveHost('www.albany.mny.availabs.com', 'availabs.com').patternSubdomain, 'albany');
  });

  await test('domain validation (mirror of the client)', () => {
    assert.strictEqual(verify.normalize(' HTTPS://DevMNY.org/x '), 'devmny.org');
    assert.strictEqual(verify.domainProblem('devmny.org', 'availabs.com'), '');
    assert.match(verify.domainProblem('x.availabs.com', 'availabs.com'), /hub/);
    assert.match(verify.domainProblem('www.devmny.org', 'availabs.com'), /www/);
    assert.match(verify.domainProblem('1.2.3.4', 'availabs.com'), /IP/);
    assert.match(verify.domainProblem('nodot', 'availabs.com'), /valid/);
  });

  await test('token: stable per hub and tenant, different across tenants', () => {
    assert.strictEqual(verify.tokenFor('hub', 1), verify.tokenFor('hub', 1));
    assert.notStrictEqual(verify.tokenFor('hub', 1), verify.tokenFor('hub', 2));
    assert.match(verify.tokenFor('hub', 1), /^[0-9a-f]{32}$/);
  });

  const fake = (records) => ({
    resolveTxt: async (n) => { if (records.txt[n]) return records.txt[n].map(v => [v]); throw Object.assign(new Error('nf'), { code: 'ENOTFOUND' }); },
    resolve4: async (n) => { if (records.a[n]) return records.a[n]; if (records.fail) throw Object.assign(new Error('t'), { code: 'ETIMEOUT' }); throw Object.assign(new Error('nf'), { code: 'ENODATA' }); },
  });
  const ips = ['10.0.0.1'];
  const token = verify.tokenFor('hub', 1);

  await test('checkDomain: all records in place', async () => {
    const r = await verify.checkDomain('devmny.org', token, { ips, r: fake({
      txt: { '_dms-verify.devmny.org': [`dms-verify=${token}`, 'v=spf1 -all'] },
      a: { 'devmny.org': ['10.0.0.1'], 'dms-wildcard-check.devmny.org': ['10.0.0.1'] },
    }) });
    assert.deepStrictEqual([r.txt, r.a, r.wildcard, r.problem], [true, true, true, '']);
  });

  await test('checkDomain: wrong token, A elsewhere, no wildcard', async () => {
    const r = await verify.checkDomain('devmny.org', token, { ips, r: fake({
      txt: { '_dms-verify.devmny.org': ['dms-verify=someone-else'] },
      a: { 'devmny.org': ['192.0.2.9'] },
    }) });
    assert.deepStrictEqual([r.txt, r.a, r.wildcard], [false, false, false]);
    assert.match(r.problem, /different value/);
    assert.match(r.problem, /192\.0\.2\.9, not the hub/);
  });

  await test('checkDomain: nothing at all, and a resolver failure', async () => {
    const none = await verify.checkDomain('devmny.org', token, { ips, r: fake({ txt: {}, a: {} }) });
    assert.match(none.problem, /no TXT record/);
    assert.match(none.problem, /no A record/);
    const failed = await verify.checkDomain('devmny.org', token, { ips, r: fake({ txt: {}, a: {}, fail: true }) });
    assert.match(failed.problem, /DNS lookup failed \(ETIMEOUT\)/);
  });

  await test('applyCheck: verified once both pass, and stays verified', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    const pending = verify.applyCheck({ domain: 'd.org', status: 'pending' }, { txt: true, a: false, wildcard: false, problem: 'x' }, now);
    assert.strictEqual(pending.status, 'pending');
    const ok = verify.applyCheck(pending, { txt: true, a: true, wildcard: false, problem: '' }, now);
    assert.deepStrictEqual([ok.status, ok.verified_at], ['verified', now.toISOString()]);
    const later = verify.applyCheck(ok, { txt: false, a: false, wildcard: false, problem: 'gone' }, new Date('2026-12-01T00:00:00Z'));
    assert.deepStrictEqual([later.status, later.verified_at, later.problem], ['verified', now.toISOString(), 'gone']);
  });

  await test('expired: pending past the grace period only', () => {
    const now = Date.parse('2026-11-20T00:00:00Z');
    assert.strictEqual(verify.expired({ status: 'pending', added_at: '2026-11-01T00:00:00Z' }, now), true);
    assert.strictEqual(verify.expired({ status: 'pending', added_at: '2026-11-15T00:00:00Z' }, now), false);
    assert.strictEqual(verify.expired({ status: 'verified', added_at: '2026-01-01T00:00:00Z' }, now), false);
  });

  console.log(`${passed} passed`);
})();
