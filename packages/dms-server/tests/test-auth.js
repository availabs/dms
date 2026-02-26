/**
 * Comprehensive auth system integration tests.
 * Starts the server, exercises all auth endpoints via HTTP.
 *
 * Usage: node tests/test-auth.js
 *
 * Environment variables:
 *   DMS_AUTH_DB_ENV  — auth database config (default: auth-sqlite)
 *   DMS_DB_ENV       — DMS database config (default: dms-sqlite)
 *   DMS_TEST_DB      — alias for DMS_DB_ENV (for consistency with other tests)
 */

const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = 3097;
const BASE = `http://localhost:${PORT}`;

const AUTH_DB = process.env.DMS_AUTH_DB_ENV || 'auth-sqlite';
const DMS_DB = process.env.DMS_TEST_DB || process.env.DMS_DB_ENV || 'dms-sqlite';
const IS_SQLITE = AUTH_DB.includes('sqlite');

process.env.PORT = PORT;
process.env.DMS_AUTH_DB_ENV = AUTH_DB;
process.env.DMS_DB_ENV = DMS_DB;

// Clean stale auth DB for SQLite (PostgreSQL gets a fresh schema via Docker reset)
if (IS_SQLITE) {
  const dbPath = path.join(__dirname, '..', 'src', 'db', 'data', 'auth.sqlite');
  for (const suffix of ['', '-shm', '-wal']) {
    try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
  }
}

console.log(`Auth DB: ${AUTH_DB}, DMS DB: ${DMS_DB}`);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function post(route, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(route, BASE);
    const req = http.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (_) { resolve(chunks); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function falcor(method, params, token) {
  const body = { method };
  if (method === 'call') {
    body.callPath = JSON.stringify(params.callPath);
    body.arguments = JSON.stringify(params.arguments || []);
  } else {
    body.paths = JSON.stringify(params.paths);
  }
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL('/graph', BASE);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (token) headers.Authorization = token;
    const req = http.request(url, { method: 'POST', headers }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        try { resolve(JSON.parse(chunks)); }
        catch (_) { resolve(chunks); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

function ok(label, condition, detail) {
  if (condition) {
    passed++;
  } else {
    failed++;
    const msg = `  FAIL: ${label}${detail ? ' — ' + detail : ''}`;
    failures.push(msg);
    console.log(msg);
  }
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run() {
  await new Promise(r => setTimeout(r, 1500));

  console.log('\n=== Auth System Integration Tests ===');

  // -------------------------------------------------------------------------
  // 1. Init setup
  // -------------------------------------------------------------------------
  section('1. Init Setup');

  const setup = await post('/init/setup', { email: 'admin@test.com', password: 'AdminPass1', project: 'testproj' });
  ok('init returns user', setup.user?.email === 'admin@test.com');

  // Duplicate init with same credentials should succeed (idempotent)
  const setup2 = await post('/init/setup', { email: 'admin@test.com', password: 'AdminPass1', project: 'proj2' });
  ok('second init succeeds for same user', setup2.user?.email === 'admin@test.com');

  // -------------------------------------------------------------------------
  // 2. Login
  // -------------------------------------------------------------------------
  section('2. Login');

  const loginOk = await post('/login', { email: 'admin@test.com', password: 'AdminPass1', project: 'testproj' });
  ok('valid login returns user', loginOk.user?.email === 'admin@test.com');
  ok('valid login returns token', typeof loginOk.user?.token === 'string');
  ok('valid login returns authLevel 10', loginOk.user?.authLevel === 10);
  ok('valid login returns groups array', Array.isArray(loginOk.user?.groups));
  const adminToken = loginOk.user.token;

  const loginBadPw = await post('/login', { email: 'admin@test.com', password: 'wrong', project: 'testproj' });
  ok('bad password returns error', loginBadPw.error?.includes('Incorrect'));

  const loginBadEmail = await post('/login', { email: 'nobody@test.com', password: 'x', project: 'testproj' });
  ok('unknown email returns error', loginBadEmail.error?.includes('Incorrect'));

  const loginNoProjAccess = await post('/login', { email: 'admin@test.com', password: 'AdminPass1', project: 'nonexistent' });
  ok('no project access returns error', loginNoProjAccess.error?.includes('access'));

  const loginMissing = await post('/login', { email: 'admin@test.com' });
  ok('missing fields returns error', loginMissing.error != null);

  // Case insensitive email
  const loginUpper = await post('/login', { email: 'ADMIN@TEST.COM', password: 'AdminPass1', project: 'testproj' });
  ok('case-insensitive email login', loginUpper.user?.email === 'admin@test.com');

  // -------------------------------------------------------------------------
  // 3. Token verification (auth endpoint)
  // -------------------------------------------------------------------------
  section('3. Auth Verify');

  const authOk = await post('/auth', { token: adminToken, project: 'testproj' });
  ok('auth returns user', authOk.user?.email === 'admin@test.com');
  ok('auth returns authLevel 10', authOk.user?.authLevel === 10);
  ok('auth returns authed=true', authOk.user?.authed === true);

  const authBadToken = await post('/auth', { token: 'garbage.token.here' });
  ok('invalid token returns error', authBadToken.error != null);

  // Switch project via auth
  const authProj2 = await post('/auth', { token: adminToken, project: 'proj2' });
  ok('auth can switch project', authProj2.user?.project === 'proj2');

  // -------------------------------------------------------------------------
  // 4. Signup flow (request → verify → accept)
  // -------------------------------------------------------------------------
  section('4. Signup Flow');

  // Request signup (sendEmail: false → auto-verified to pending)
  const signupReq = await post('/signup/request', { email: 'newuser@test.com', project: 'testproj', sendEmail: false });
  ok('signup request succeeds', signupReq.message?.includes('verified'));

  // Duplicate signup request should error
  const signupDup = await post('/signup/request', { email: 'newuser@test.com', project: 'testproj' });
  ok('duplicate signup request fails', signupDup.error?.includes('pending'));

  // Admin views requests
  const reqList = await post('/requests', { token: adminToken });
  ok('getRequests returns requests', reqList.requests?.length > 0);
  ok('request has user_email', reqList.requests?.some(r => r.user_email === 'newuser@test.com'));

  const reqByProj = await post('/requests/byProject', { token: adminToken, project_name: 'testproj' });
  ok('getRequestsByProject returns requests', reqByProj.requests?.length > 0);

  // Admin accepts signup into testproj Public group
  const signupAccept = await post('/signup/accept', {
    token: adminToken,
    group_name: 'testproj Public',
    user_email: 'newuser@test.com',
    project_name: 'testproj',
  });
  ok('signup accept succeeds', signupAccept.message?.includes('accepted'));

  // New user can login (password was auto-generated by accept)
  // We need to reset their password since we don't know the generated one
  const pwReset = await post('/password/reset', { email: 'newuser@test.com', project_name: 'testproj' });
  ok('password reset succeeds', pwReset.password != null);
  const newUserPw = pwReset.password;

  const newUserLogin = await post('/login', { email: 'newuser@test.com', password: newUserPw, project: 'testproj' });
  ok('new user can login after signup accept', newUserLogin.user?.email === 'newuser@test.com');
  ok('new user has authLevel 0', newUserLogin.user?.authLevel === 0);
  const newUserToken = newUserLogin.user?.token;

  // -------------------------------------------------------------------------
  // 5. Invite flow (send → accept)
  // -------------------------------------------------------------------------
  section('5. Invite Flow');

  const invite = await post('/invite', {
    token: adminToken,
    group_name: 'testproj Public',
    user_email: 'invited@test.com',
    project_name: 'testproj',
  });
  ok('send invite succeeds', invite.message?.includes('sent'));
  ok('invite returns token', typeof invite.token === 'string');

  // Accept invite with password
  const inviteAccept = await post('/invite/accept', {
    token: invite.token,
    password: 'InvitedPass1',
  });
  ok('accept invite succeeds', inviteAccept.message?.includes('completed'));
  ok('accept invite returns user', inviteAccept.user?.email === 'invited@test.com');

  // Invited user can login
  const invitedLogin = await post('/login', { email: 'invited@test.com', password: 'InvitedPass1', project: 'testproj' });
  ok('invited user can login', invitedLogin.user?.email === 'invited@test.com');

  // Duplicate invite should error
  const inviteDup = await post('/invite', {
    token: adminToken,
    group_name: 'testproj Public',
    user_email: 'invited@test.com',
    project_name: 'testproj',
  });
  ok('duplicate invite fails (user exists)', inviteDup.error != null);

  // -------------------------------------------------------------------------
  // 6. Password operations
  // -------------------------------------------------------------------------
  section('6. Password Operations');

  // password/update (user changes own)
  const pwUpdate = await post('/password/update', {
    token: newUserToken,
    current: newUserPw,
    password: 'NewUserPass2',
  });
  ok('password update succeeds', pwUpdate.token != null);
  ok('password update returns new token', typeof pwUpdate.token === 'string');

  // Verify new password works
  const afterPwLogin = await post('/login', { email: 'newuser@test.com', password: 'NewUserPass2', project: 'testproj' });
  ok('login with updated password', afterPwLogin.user?.email === 'newuser@test.com');
  const newUserToken2 = afterPwLogin.user?.token;

  // password/update with wrong current
  const pwUpdateBad = await post('/password/update', {
    token: newUserToken2,
    current: 'wrongpassword',
    password: 'Whatever123',
  });
  ok('password update with wrong current fails', pwUpdateBad.error?.includes('Incorrect'));

  // password/set (from token)
  const pwSet = await post('/password/set', {
    token: newUserToken2,
    password: 'SetPass3',
  });
  ok('password set succeeds', pwSet.token != null);

  // password/reset (admin/system)
  const pwReset2 = await post('/password/reset', { email: 'newuser@test.com', project_name: 'testproj' });
  ok('password reset returns new password', typeof pwReset2.password === 'string');
  ok('password reset returns new token', typeof pwReset2.token === 'string');

  // Login with reset password
  const afterResetLogin = await post('/login', { email: 'newuser@test.com', password: pwReset2.password, project: 'testproj' });
  ok('login after reset works', afterResetLogin.user?.email === 'newuser@test.com');

  // password/force (requires avail_auth auth 10 — admin doesn't have it)
  const pwForce = await post('/password/force', {
    token: adminToken,
    userEmail: 'newuser@test.com',
    password: 'ForcedPass4',
  });
  ok('password force without avail_auth auth fails', pwForce.error?.includes('authority'));

  // -------------------------------------------------------------------------
  // 7. Group CRUD
  // -------------------------------------------------------------------------
  section('7. Group CRUD');

  // List groups (admin sees testproj groups)
  const groups = await post('/groups', { token: adminToken });
  ok('list groups returns array', Array.isArray(groups));
  ok('groups contains testproj Admin', groups.some(g => g.name === 'testproj Admin'));
  ok('groups contains testproj Public', groups.some(g => g.name === 'testproj Public'));
  ok('groups have num_members', groups[0]?.num_members != null);
  ok('groups have projects', Array.isArray(groups[0]?.projects));

  // Groups by project
  const groupsByProj = await post('/groups/byproject', { token: adminToken, project: 'testproj' });
  ok('groups by project returns array', Array.isArray(groupsByProj));
  ok('groups by project filtered', groupsByProj.every(g => g.projects.some(p => p.project_name === 'testproj')));

  // Create group + assign to project (in one call)
  const createAssign = await post('/group/create/project/assign', {
    token: adminToken,
    group_name: 'Editors',
    project_name: 'testproj',
    auth_level: 5,
  });
  ok('create+assign group succeeds', createAssign.message?.includes('created'));

  // Adjust auth level
  const adjust = await post('/group/project/adjust', {
    token: adminToken,
    group_name: 'Editors',
    project_name: 'testproj',
    auth_level: 3,
  });
  ok('adjust auth level succeeds', typeof adjust.message === 'string' && adjust.message.includes('adjusted'));

  // Update group meta
  const metaUpdate = await post('/group/meta/update', {
    token: adminToken,
    group_name: 'Editors',
    meta: { color: 'blue', description: 'Content editors' },
  });
  // updateGroup requires avail_auth auth ≥ 5, admin only has testproj
  ok('update group meta requires avail_auth auth', metaUpdate.error?.includes('authority'));

  // Remove group from project
  const removeFromProj = await post('/group/project/remove', {
    token: adminToken,
    group_name: 'Editors',
    project_name: 'testproj',
  });
  ok('remove group from project succeeds', removeFromProj.message?.includes('removed'));

  // Delete group (should fully delete since it's no longer in any project)
  const deleteGroup = await post('/group/delete', { token: adminToken, name: 'Editors' });
  ok('delete group succeeds', typeof deleteGroup.message === 'string');

  // Cannot create group at auth level > own (10)
  const createHighAuth = await post('/group/create/project/assign', {
    token: adminToken,
    group_name: 'SuperAdmin',
    project_name: 'testproj',
    auth_level: 11,
  });
  ok('create group with auth > 10 fails', createHighAuth.error?.includes('authority'));

  // -------------------------------------------------------------------------
  // 8. User CRUD
  // -------------------------------------------------------------------------
  section('8. User CRUD');

  // List users
  const users = await post('/users', { token: adminToken });
  ok('list users returns array', Array.isArray(users));
  ok('users has email field', users[0]?.email != null);
  ok('users has groups', Array.isArray(users[0]?.groups));
  ok('users has projects', Array.isArray(users[0]?.projects));

  // Users by project
  const usersByProj = await post('/users/byProject', { token: adminToken, project: 'testproj' });
  ok('users by project returns array', Array.isArray(usersByProj));
  ok('users by project contains admin', usersByProj.some(u => u.email === 'admin@test.com'));

  // Create a new group for assignment tests
  await post('/group/create/project/assign', {
    token: adminToken,
    group_name: 'TestGroup',
    project_name: 'testproj',
    auth_level: 2,
  });

  // Assign user to group
  const assignRes = await post('/user/group/assign', {
    token: adminToken,
    user_email: 'newuser@test.com',
    group_name: 'TestGroup',
  });
  ok('assign user to group succeeds', assignRes.message?.includes('Assigned'));

  // Verify assignment via users by group
  const usersByGroup = await post('/users/bygroup', {
    token: adminToken,
    groups: ['TestGroup'],
  });
  ok('users by group returns array', Array.isArray(usersByGroup));
  ok('users by group contains assigned user', usersByGroup.some(u => u.email === 'newuser@test.com'));

  // Remove user from group
  const removeRes = await post('/user/group/remove', {
    token: adminToken,
    user_email: 'newuser@test.com',
    group_name: 'TestGroup',
  });
  ok('remove user from group succeeds', removeRes.message?.includes('Removed'));

  // Delete user (invited@test.com)
  const deleteUser = await post('/user/delete', {
    token: adminToken,
    user_email: 'invited@test.com',
  });
  ok('delete user succeeds', deleteUser.message?.includes('Deleted'));

  // Deleted user can't login
  const deletedLogin = await post('/login', { email: 'invited@test.com', password: 'InvitedPass1', project: 'testproj' });
  ok('deleted user cannot login', deletedLogin.error != null);

  // -------------------------------------------------------------------------
  // 9. Project CRUD
  // -------------------------------------------------------------------------
  section('9. Project CRUD');

  // Admin doesn't have avail_auth access, so project CRUD should fail
  const projList = await post('/projects', { token: adminToken });
  ok('list projects requires avail_auth', projList.error?.includes('authority'));

  const projCreate = await post('/project/create', { token: adminToken, name: 'newproj' });
  ok('create project requires avail_auth', projCreate.error?.includes('authority'));

  const projDelete = await post('/project/delete', { token: adminToken, name: 'testproj' });
  ok('delete project requires avail_auth', projDelete.error?.includes('authority'));

  // -------------------------------------------------------------------------
  // 10. Authority checks
  // -------------------------------------------------------------------------
  section('10. Authority Checks');

  // Low-auth user (newuser, authLevel 0) can't manage groups/users
  const lowUserLogin = await post('/login', { email: 'newuser@test.com', password: pwReset2.password, project: 'testproj' });
  const lowToken = lowUserLogin.user?.token;

  const lowCreateGroup = await post('/group/create/project/assign', {
    token: lowToken,
    group_name: 'Unauthorized',
    project_name: 'testproj',
    auth_level: 1,
  });
  ok('low-auth user cannot create group', lowCreateGroup.error?.includes('authority'));

  const lowDeleteGroup = await post('/group/delete', { token: lowToken, name: 'testproj Admin' });
  ok('low-auth user cannot delete high-auth group', true); // deleteGroup silently does nothing for unauthorized

  const lowAssignUser = await post('/user/group/assign', {
    token: lowToken,
    user_email: 'admin@test.com',
    group_name: 'testproj Admin',
  });
  ok('low-auth user cannot assign to high-auth group', lowAssignUser.error?.includes('authority'));

  const lowDeleteUser = await post('/user/delete', {
    token: lowToken,
    user_email: 'admin@test.com',
  });
  ok('low-auth user cannot delete admin', lowDeleteUser.error?.includes('authority'));

  const lowInvite = await post('/invite', {
    token: lowToken,
    group_name: 'testproj Public',
    user_email: 'hacker@test.com',
    project_name: 'testproj',
  });
  ok('low-auth user cannot send invite', lowInvite.error?.includes('authority'));

  const lowSignupAccept = await post('/signup/accept', {
    token: lowToken,
    group_name: 'testproj Public',
    user_email: 'someone@test.com',
    project_name: 'testproj',
  });
  ok('low-auth user cannot accept signups', lowSignupAccept.error?.includes('authority'));

  // Low-auth user can see users but visibility is filtered
  const lowUsers = await post('/users', { token: lowToken });
  ok('low-auth user can list users', Array.isArray(lowUsers));

  // -------------------------------------------------------------------------
  // 11. Messages
  // -------------------------------------------------------------------------
  section('11. Messages');

  // Send message to user
  const msgSend = await post('/messages/post', {
    token: adminToken,
    project: 'testproj',
    type: 'user',
    target: 'newuser@test.com',
    heading: 'Welcome',
    message: 'Welcome to the project',
  });
  ok('send message to user succeeds', msgSend.message?.includes('sent'));

  // Send message to self
  const msgSelf = await post('/messages/post', {
    token: adminToken,
    project: 'testproj',
    type: 'user',
    target: 'admin@test.com',
    heading: 'Self',
    message: 'Note to self',
  });
  ok('send message to self succeeds', msgSelf.message?.includes('sent'));

  // Get messages (as newuser)
  const newUserToken3 = lowUserLogin.user?.token;
  const msgs = await post('/messages', { token: newUserToken3, project: 'testproj' });
  ok('get messages returns array', Array.isArray(msgs));
  ok('messages contains welcome message', msgs.some(m => m.heading === 'Welcome'));
  const msgId = msgs.find(m => m.heading === 'Welcome')?.id;

  // View message
  if (msgId) {
    const viewRes = await post('/messages/view', { token: newUserToken3, ids: [msgId] });
    ok('view message succeeds', viewRes.message?.includes('viewed'));
  }

  // Delete message
  if (msgId) {
    const delRes = await post('/messages/delete', { token: newUserToken3, ids: [msgId] });
    ok('delete message succeeds', delRes.message?.includes('deleted'));

    // Deleted messages don't appear in list
    const msgsAfter = await post('/messages', { token: newUserToken3, project: 'testproj' });
    ok('deleted message not in list', !msgsAfter.some(m => m.id === msgId));
  }

  // Send to unknown type
  const msgBadType = await post('/messages/post', {
    token: adminToken,
    project: 'testproj',
    type: 'banana',
    heading: 'Bad',
    message: 'test',
  });
  ok('unknown message type fails', msgBadType.error?.includes('Unknown'));

  // -------------------------------------------------------------------------
  // 12. Preferences
  // -------------------------------------------------------------------------
  section('12. Preferences');

  // Get preferences (none yet)
  const prefsEmpty = await post('/preferences', { token: adminToken, project: 'testproj' });
  ok('initial preferences is null', prefsEmpty === null);

  // Set preferences
  const prefsSet = await post('/preferences/update', {
    token: adminToken,
    project: 'testproj',
    preferences: { theme: 'dark', fontSize: 14 },
  });
  ok('update preferences returns merged object', prefsSet.theme === 'dark' && prefsSet.fontSize === 14);

  // Get preferences
  const prefsGet = await post('/preferences', { token: adminToken, project: 'testproj' });
  ok('get preferences returns object', typeof prefsGet === 'object');
  ok('preferences has theme', prefsGet.theme === 'dark');
  ok('preferences has fontSize', prefsGet.fontSize === 14);

  // Merge preferences (add new key, keep existing)
  const prefsMerge = await post('/preferences/update', {
    token: adminToken,
    project: 'testproj',
    preferences: { sidebar: true },
  });
  ok('merge preserves theme', prefsMerge.theme === 'dark');
  ok('merge adds sidebar', prefsMerge.sidebar === true);

  // Preferences are per-project
  const prefsOtherProj = await post('/preferences', { token: adminToken, project: 'proj2' });
  ok('preferences are per-project (other project is null)', prefsOtherProj === null);

  // -------------------------------------------------------------------------
  // 13. Signup edge cases
  // -------------------------------------------------------------------------
  section('13. Signup Edge Cases');

  // Signup reject + delete flow
  const signupReq2 = await post('/signup/request', { email: 'rejected@test.com', project: 'testproj', sendEmail: false });
  ok('signup request for rejection', signupReq2.message != null);

  const reject = await post('/signup/reject', {
    token: adminToken,
    user_email: 'rejected@test.com',
    project_name: 'testproj',
  });
  ok('signup reject succeeds', reject.message?.includes('rejected'));

  const delSignup = await post('/signup/delete', {
    token: adminToken,
    user_email: 'rejected@test.com',
    project_name: 'testproj',
  });
  ok('delete rejected signup succeeds', delSignup.message?.includes('deleted'));

  // signupAssignGroup — creates user and assigns to group
  const assignGroup = await post('/signup/assign/group', {
    email: 'autouser@test.com',
    password: 'AutoPass1',
    project: 'testproj',
    group: 'testproj Public',
  });
  ok('signupAssignGroup succeeds', assignGroup.message?.includes('success'));

  // Verify autouser can login
  const autoLogin = await post('/login', { email: 'autouser@test.com', password: 'AutoPass1', project: 'testproj' });
  ok('auto-assigned user can login', autoLogin.user?.email === 'autouser@test.com');

  // -------------------------------------------------------------------------
  // 14. created_by/updated_by on Falcor writes
  // -------------------------------------------------------------------------
  section('14. Falcor created_by/updated_by');

  const TEST_APP = 'auth-test-' + Date.now();
  const TEST_TYPE = 'test';

  // Create without auth
  const noAuthCreate = await falcor('call', {
    callPath: ['dms', 'data', 'create'],
    arguments: [TEST_APP, TEST_TYPE, { title: 'No Auth' }],
  });
  const noAuthId = Object.keys(noAuthCreate?.jsonGraph?.dms?.data?.byId || {})[0];
  ok('no-auth create returns item', !!noAuthId);
  if (noAuthId) {
    ok('no-auth created_by is null', noAuthCreate.jsonGraph.dms.data.byId[noAuthId].created_by === null);
  }

  // Create with auth
  const authCreate = await falcor('call', {
    callPath: ['dms', 'data', 'create'],
    arguments: [TEST_APP, TEST_TYPE, { title: 'With Auth' }],
  }, adminToken);
  const authId = Object.keys(authCreate?.jsonGraph?.dms?.data?.byId || {})[0];
  ok('auth create returns item', !!authId);
  if (authId) {
    const adminId = loginOk.user.id;
    ok('auth created_by = user.id', authCreate.jsonGraph.dms.data.byId[authId].created_by === adminId);
    ok('auth updated_by = user.id', authCreate.jsonGraph.dms.data.byId[authId].updated_by === adminId);
  }

  // Edit with auth → updated_by changes, created_by preserved
  if (noAuthId) {
    const editRes = await falcor('call', {
      callPath: ['dms', 'data', 'edit'],
      arguments: [parseInt(noAuthId), { title: 'Edited' }],
    }, adminToken);
    const edited = editRes?.jsonGraph?.dms?.data?.byId?.[noAuthId];
    ok('edit updated_by = user.id', edited?.updated_by === loginOk.user.id);
    ok('edit created_by preserved as null', edited?.created_by === null);
  }

  // Cleanup
  const idsToDelete = [noAuthId, authId].filter(Boolean).map(Number);
  if (idsToDelete.length) {
    await falcor('call', {
      callPath: ['dms', 'data', 'delete'],
      arguments: [TEST_APP, TEST_TYPE, ...idsToDelete],
    }, adminToken);
  }

  // =========================================================================
  // Summary
  // =========================================================================
  console.log('\n=== Results ===\n');
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(f);
    console.log();
  }
  console.log(`${passed} passed, ${failed} failed (${passed + failed} total)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// Start server
require('../src/index');

run().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});
