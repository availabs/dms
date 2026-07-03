/**
 * JWT middleware failure classification
 * (planning/tasks/current/no-access-stub-default-theme.md, fix 2).
 *
 * The middleware must keep serving expected auth failures (bad/expired token,
 * unknown user) quietly as anonymous — but auth INFRASTRUCTURE failures
 * (auth-DB/network errors) were being swallowed by the same silent catch,
 * making every affected request anonymous with zero trace. Those must warn.
 *
 * Run: node tests/test-jwt-failures.js
 */
const assert = require('assert');
const { createJwtMiddleware } = require('../src/auth/jwt');
const { createUserToken, signToken } = require('../src/auth/utils/crypto');

let pass = 0, fail = 0;
const t = async (name, fn) => {
  try { await fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

// Minimal fake auth DB. verifyAndGetUser issues two queries:
//   SELECT * FROM users WHERE email = $1
//   group lookup (joins groups/projects)
const makeDb = ({ users = [], groups = [], throwWith = null } = {}) => ({
  query: async (sql) => {
    if (throwWith) throw throwWith;
    if (/FROM users\b/i.test(sql)) return { rows: users }; // \b: not users_in_groups
    return { rows: groups };
  },
});

// Run the middleware once and capture console.warn calls
async function runMiddleware(db, token) {
  const middleware = createJwtMiddleware('unused-env', { db });
  const req = { method: 'POST', headers: token ? { authorization: token } : {} };
  const warns = [];
  const origWarn = console.warn;
  console.warn = (...args) => warns.push(args.join(' '));
  try {
    await new Promise((resolve) => middleware(req, {}, resolve));
  } finally {
    console.warn = origWarn;
  }
  return { user: req.availAuthContext?.user ?? null, warns };
}

async function main() {
  console.log('jwt middleware failure classification:');

  await t('valid token + healthy DB → user set, no warn', async () => {
    const token = await createUserToken('ok@test.com', 'HASH', 'proj');
    const db = makeDb({
      users: [{ id: 1, email: 'ok@test.com', password: 'HASH' }],
      groups: [{ name: 'Admin', auth_level: 10, meta: null }],
    });
    const { user, warns } = await runMiddleware(db, token);
    assert.strictEqual(user?.email, 'ok@test.com');
    assert.deepStrictEqual(user?.groups, ['Admin']);
    assert.strictEqual(warns.length, 0);
  });

  await t('no authorization header → anonymous, no warn', async () => {
    const { user, warns } = await runMiddleware(makeDb(), null);
    assert.strictEqual(user, null);
    assert.strictEqual(warns.length, 0);
  });

  await t('garbage token → anonymous, no warn (expected failure)', async () => {
    const { user, warns } = await runMiddleware(makeDb(), 'not-a-jwt');
    assert.strictEqual(user, null);
    assert.strictEqual(warns.length, 0);
  });

  await t('expired token → anonymous, no warn (expected failure)', async () => {
    const token = await signToken(
      { email: 'old@test.com', password: 'HASH', project: 'proj' }, -10);
    const { user, warns } = await runMiddleware(makeDb(), token);
    assert.strictEqual(user, null);
    assert.strictEqual(warns.length, 0);
  });

  await t('valid token, unknown user → anonymous, no warn (expected failure)', async () => {
    const token = await createUserToken('gone@test.com', 'HASH', 'proj');
    const { user, warns } = await runMiddleware(makeDb({ users: [] }), token);
    assert.strictEqual(user, null);
    assert.strictEqual(warns.length, 0);
  });

  await t('valid token + auth-DB error → anonymous AND warn logged', async () => {
    const token = await createUserToken('dbdown@test.com', 'HASH', 'proj');
    const db = makeDb({ throwWith: new Error('connect ECONNREFUSED 10.0.0.5:5432') });
    const { user, warns } = await runMiddleware(db, token);
    assert.strictEqual(user, null);
    assert.strictEqual(warns.length, 1, `expected 1 warn, got ${warns.length}`);
    assert(warns[0].includes('ECONNREFUSED'), `warn should carry the cause: ${warns[0]}`);
  });

  console.log(`\njwt-failure tests: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
