/**
 * The row-auth gate (routes/dms/rowAuthGate.js) — defaults and rollout modes.
 * Fixtures only, no database. Run: node tests/test-row-auth-gate.js
 */
const assert = require('assert');
const { createGate, verdict, rowAuthMode } = require('../src/routes/auth/rowAuth/rowAuthGate');

let pass = 0, fail = 0;
const cases = [];
const t = (name, fn) => cases.push([name, fn]);
const section = (name) => cases.push([name, null]);

const ROWS = {
    1: { id: 1, type: 'prod:site', data: {} },
    2: { id: 2, type: 'prod|county:pattern', data: { authPermissions: { groups: { Editors: ['read', 'edit'] } } } },
    3: { id: 3, type: 'county|page', data: {} },
    4: { id: 4, type: 'county|page', data: { parent: '3' } },
};
// an app where nothing is configured anywhere
const BLANK = { 10: { id: 10, type: 'blank:site', data: {} }, 11: { id: 11, type: 'blank|page', data: {} } };

const controllerFor = (rows) => ({
    authRowsByIds: async (ids) => ids.map(i => rows[i]).filter(Boolean),
    authContainers: async () => Object.values(rows).filter(r => /:/.test(r.type)),
});
const gate = (rows, user, app = 'prod') =>
    createGate({ controller: controllerFor(rows), app, user });

const editor = { id: 'u1', authed: true, groups: ['Editors'] };
const nobody = { id: 'u2', authed: true, groups: [] };
const anon = { id: null, authed: false, groups: [] };
const appAdmin = { id: 'u9', authed: true, groups: ['prod Admin'] };

const withMode = async (mode, fn) => {
    const prev = process.env.DMS_AUTH_MODE;
    const warn = console.warn; const lines = [];
    process.env.DMS_AUTH_MODE = mode;
    console.warn = (m) => lines.push(String(m));
    try { return await fn(lines); }
    finally { console.warn = warn; if (prev === undefined) delete process.env.DMS_AUTH_MODE; else process.env.DMS_AUTH_MODE = prev; }
};

section('rule 5 — an unstated chain is read-allowed, write-denied');
t('blank app: read allowed', () => {
    const v = verdict({ groups: {}, users: {} }, nobody, 'read', 'blank');
    assert.strictEqual(v.allow, true);
});
t('blank app: edit denied', () => {
    const v = verdict({ groups: {}, users: {} }, nobody, 'edit', 'blank');
    assert.strictEqual(v.allow, false);
});
t('blank app end to end, enforce', () => withMode('enforce', async () => {
    const g = createGate({ controller: controllerFor(BLANK), app: 'blank', user: nobody });
    assert.strictEqual((await g.judgeOne(BLANK[11], 'read')).allow, true);
    assert.strictEqual((await g.judgeOne(BLANK[11], 'edit')).allow, false);
}));

section('a stated chain decides');
t('a grantee may edit a descendant', () => withMode('enforce', async () => {
    assert.strictEqual((await gate(ROWS, editor).judgeOne(ROWS[4], 'edit')).allow, true);
}));
t('a non-grantee may not', () => withMode('enforce', async () => {
    assert.strictEqual((await gate(ROWS, nobody).judgeOne(ROWS[4], 'edit')).allow, false);
}));
t('…but may still read it (nothing denied reads)', () => withMode('enforce', async () => {
    assert.strictEqual((await gate(ROWS, nobody).judgeOne(ROWS[4], 'read')).allow, false,
        'a STATED chain that grants no read denies it');
}));
t('${app} Admin always passes', () => withMode('enforce', async () => {
    assert.strictEqual((await gate(ROWS, appAdmin).judgeOne(ROWS[4], 'grant')).allow, true);
}));
t('anonymous gets only what public holds', () => withMode('enforce', async () => {
    const rows = { ...ROWS, 2: { id: 2, type: 'prod|county:pattern', data: { authPermissions: { groups: { public: ['read'] } } } } };
    assert.strictEqual((await gate(rows, anon).judgeOne(rows[4], 'read')).allow, true);
    assert.strictEqual((await gate(rows, anon).judgeOne(rows[4], 'edit')).allow, false);
}));

section('rollout modes');
t('log allows but writes a would-deny line', () => withMode('log', async (lines) => {
    const v = await gate(ROWS, nobody).judgeOne(ROWS[4], 'edit');
    assert.strictEqual(v.allow, true);
    assert.ok(/would-deny/.test(v.reason), v.reason);
    assert.ok(lines.some(l => l.includes('[row-auth] would-deny edit')), lines.join('\n'));
}));
t('enforce refuses', () => withMode('enforce', async (lines) => {
    assert.strictEqual((await gate(ROWS, nobody).judgeOne(ROWS[4], 'edit')).allow, false);
    assert.strictEqual(lines.length, 0, 'enforce does not also log');
}));
t('default mode is log', () => {
    const prev = process.env.DMS_AUTH_MODE; delete process.env.DMS_AUTH_MODE;
    try { assert.strictEqual(rowAuthMode(), 'log'); }
    finally { if (prev !== undefined) process.env.DMS_AUTH_MODE = prev; }
});
t('an unknown mode falls back to log', () => withMode('banana', () => {
    assert.strictEqual(rowAuthMode(), 'log');
}));

section('create judges the PARENT');
t('`edit` does NOT confer `create` — they are separate structural verbs', () =>
    withMode('enforce', async () => {
        // ROWS[2] grants Editors ['read','edit']. A create needs `create`.
        assert.strictEqual((await gate(ROWS, editor).judgeCreate(ROWS[4])).allow, false);
    }));
t('a `create` grant on an ancestor reaches a would-be child', () => withMode('enforce', async () => {
    const rows = { ...ROWS, 2: { id: 2, type: 'prod|county:pattern',
        data: { authPermissions: { groups: { Editors: ['read', 'create'] } } } } };
    assert.strictEqual((await gate(rows, editor).judgeCreate(rows[4])).allow, true);
}));
t('…and is refused without it', () => withMode('enforce', async () => {
    assert.strictEqual((await gate(ROWS, nobody).judgeCreate(ROWS[4])).allow, false);
}));

section('batching');
t('judging many rows returns a verdict for each', () => withMode('enforce', async () => {
    const m = await gate(ROWS, editor).judge([ROWS[2], ROWS[3], ROWS[4]], 'read');
    assert.strictEqual(m.size, 3);
    for (const v of m.values()) assert.strictEqual(v.allow, true);
}));

(async () => {
    for (const [name, fn] of cases) {
        if (!fn) { console.log(`\n${name}`); continue; }
        try { await fn(); pass++; console.log(`  ✓ ${name}`); }
        catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
    }
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail ? 1 : 0);
})();

// ---------------------------------------------------------------------------
// publicRead — task 7 Phase 1. A pattern that must be readable WITHOUT A SESSION declares it,
// instead of the server recognising `pattern_type === 'auth' || 'admin'` by name.
{
    const vocab = (publicRead) => ({ publicRead, self: [{ value: 'edit-pattern', implies: ['read', 'edit'] }] });
    const row = (publicRead, grants) => ({
        id: 7, type: 'prod|x:pattern',
        auth: { vocabulary: vocab(publicRead), ...(grants ? { groups: grants } : {}) },
    });
    const anon = { authed: false, id: null, groups: [] };
    const controller = {
        authRowsByIds: async () => [],
        authContainers: async () => [],
    };
    // `createGate` lost its per-call `mode` override with the flag collapse (2026-11-03) — there is
    // one mode now and it is read from the environment, so these cases set it the way every other
    // suite does.
    const gateFor = (user) => createGate({ controller, app: 'myapp', user, subdomain: '' });
    const enforced = (fn) => withMode('enforce', fn);

    t('a declaring row is readable with no session, despite grants that exclude the caller', () => enforced(async () => {
        const d = await gateFor(anon).judgeOne(row(true, { Admins: ['read'] }), 'read');
        assert.strictEqual(d.allow, true);
        assert.match(d.reason, /publicRead/);
    }));
    t('the same row WITHOUT the declaration is refused', () => enforced(async () => {
        const d = await gateFor(anon).judgeOne(row(undefined, { Admins: ['read'] }), 'read');
        assert.strictEqual(d.allow, false);
    }));
    t('publicRead does not confer WRITES — it says "everyone may see", not "may change"', () => enforced(async () => {
        for (const verb of ['edit', 'create', 'delete', 'grant']) {
            const d = await gateFor(anon).judgeOne(row(true, { Admins: ['read'] }), verb);
            assert.strictEqual(d.allow, false, `${verb} must still be refused`);
        }
    }));
    t('only `true` counts — a truthy value is not a declaration', () => enforced(async () => {
        const r = { id: 7, type: 'prod|x:pattern', auth: { vocabulary: { publicRead: 'yes' }, groups: { Admins: ['read'] } } };
        assert.strictEqual((await gateFor(anon).judgeOne(r, 'read')).allow, false);
    }));
}
