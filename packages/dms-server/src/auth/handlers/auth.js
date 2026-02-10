/**
 * Core auth handlers.
 * Each function takes (db, body) where body is req.body from Express.
 * Returns result data on success, throws on failure.
 * The route layer catches errors and formats { error: message } responses.
 */

const { verifyToken, comparePassword, hashPassword, createUserToken, signToken, passwordGen } = require('../utils/crypto');
const q = require('../utils/queries');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify JWT token and get raw user data from DB. Throws if invalid. */
async function verifyAndGetUserData(db, token) {
  const decoded = await verifyToken(token);
  const { rows } = await q.getUserByEmail(db, decoded.email);
  const userData = rows[0];
  if (!userData || decoded.password !== userData.password) {
    throw new Error('Token could not be verified.');
  }
  return { ...decoded, ...userData };
}

/** Build the full user object returned to clients on login/auth. */
async function buildUserObject(db, email, passwordHash, project, id) {
  const { rows: groups } = project
    ? await q.getUserGroups(db, email, project)
    : { rows: [] };
  const authLevel = project
    ? await q.getUserAuthLevel(db, email, project)
    : 0;
  const token = await createUserToken(email, passwordHash, project);
  return {
    id,
    email,
    authLevel,
    token,
    project,
    groups: groups.map(g => g.name),
    meta: groups.map(g => ({ group: g.name, meta: g.meta, authLevel: g.auth_level })),
    authed: true,
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** POST /login — verify credentials, check project access, return user object */
async function login(db, { email, password, project }) {
  if (!email || !password || !project) throw new Error('Email, password, and project are required.');
  email = email.toLowerCase();

  const { rows } = await q.getUserByEmail(db, email);
  const userData = rows[0];
  if (!userData || !comparePassword(password, userData.password)) {
    throw new Error('Incorrect email or password.');
  }

  const hasAccess = await q.hasProjectAccess(db, email, project);
  if (!hasAccess) throw new Error(`You do not have access to project ${project}.`);

  await q.logLogin(db, email, project);
  return { user: await buildUserObject(db, email, userData.password, project, userData.id) };
}

/** POST /auth — verify existing token, optionally switch project */
async function auth(db, { token, project = null }) {
  const userData = await verifyAndGetUserData(db, token);
  const targetProject = project || userData.project;

  const hasAccess = await q.hasProjectAccess(db, userData.email, targetProject);
  if (!hasAccess) throw new Error(`You do not have access to project ${targetProject}.`);

  return { user: await buildUserObject(db, userData.email, userData.password, targetProject, userData.id) };
}

/** POST /signup/request — create or process a signup request */
async function signupRequest(db, { email, project, addToGroup, sendEmail = true }) {
  if (!email || !project) throw new Error('You must supply an email and project.');
  email = email.toLowerCase();

  // Check project exists
  const projectCount = await q.getProjectCount(db, project);
  if (!projectCount) throw new Error(`Project ${project} does not exist.`);

  // Check user doesn't already have access
  const hasAccess = await q.hasProjectAccess(db, email, project);
  if (hasAccess) throw new Error('You already have access to this project.');

  // Check no pending request
  const pendingCount = await q.getPendingSignupCount(db, email, project);
  if (pendingCount > 0) throw new Error('You already have a pending request for this project. Ask an administrator to complete your request.');

  // If addToGroup specified and it's a public group (auth_level 0)
  if (addToGroup) {
    const isPublic = await q.isPublicGroup(db, addToGroup, project);
    if (!isPublic) throw new Error('The requested group does not have auth level 0 across all projects.');

    // Check if user already exists
    const { rows: existingUsers } = await q.getUserByEmail(db, email);
    const existingUser = existingUsers[0];

    if (existingUser) {
      // User exists — add directly to group
      await q.assignUserToGroup(db, email, addToGroup, 'signup-verified');
      const user = await buildUserObject(db, email, existingUser.password, project, existingUser.id);
      return { user };
    } else {
      // User doesn't exist — create awaiting request, generate verification token
      await db.query("DELETE FROM signup_requests WHERE user_email = $1 AND project_name = $2 AND state = 'awaiting'", [email, project]);
      await q.createSignupRequest(db, email, project, 'awaiting');
      const token = await signToken({ group: addToGroup, project, email, from: 'signup-request-addToGroup' }, '24h');
      // Email would be sent here (Phase 5)
      if (!sendEmail) return { token };
      return { message: 'Your request has been received. You should receive an email shortly.' };
    }
  }

  // No addToGroup — create awaiting request for email verification
  await db.query("DELETE FROM signup_requests WHERE user_email = $1 AND project_name = $2 AND state = 'awaiting'", [email, project]);
  await q.createSignupRequest(db, email, project, 'awaiting');
  const token = await signToken({ project, email, from: 'signup-request' }, '24h');
  // Email would be sent here (Phase 5)
  if (!sendEmail) {
    // Auto-verify when email is disabled (matches reference behavior)
    await db.query("UPDATE signup_requests SET state = 'pending' WHERE user_email = $1 AND project_name = $2 AND state = 'awaiting'", [email, project]);
    return { message: 'Your email has been verified and your request is pending.' };
  }
  return { message: 'Your request has been received. You should receive an email shortly.' };
}

/** POST /email/verify — verify email from signup request */
async function verifyEmail(db, { token }) {
  const decoded = await verifyToken(token);
  const { project, email, from } = decoded;

  if (from !== 'signup-request') throw new Error('Invalid request.');

  // Check for awaiting request
  const { rows: awaiting } = await db.query(
    "SELECT count(1) AS count FROM signup_requests WHERE user_email = $1 AND project_name = $2 AND state = 'awaiting'",
    [email, project]
  );
  if (+(awaiting[0]?.count || 0) === 1) {
    await db.query(
      "UPDATE signup_requests SET state = 'pending' WHERE user_email = $1 AND project_name = $2 AND state = 'awaiting'",
      [email, project]
    );
    return { message: 'Your email has been verified and your request is pending.' };
  }

  // Check if already pending
  const { rows: pending } = await db.query(
    "SELECT count(1) AS count FROM signup_requests WHERE user_email = $1 AND project_name = $2 AND state = 'pending'",
    [email, project]
  );
  if (+(pending[0]?.count || 0) === 1) {
    return { message: 'Your email has already been verified and your request is pending.' };
  }

  throw new Error('Could not find request.');
}

/** POST /signup/request/verify — user sets password after signup-request-addToGroup */
async function signupRequestVerified(db, { token, password }) {
  const decoded = await verifyToken(token);
  const { project, group, email, from } = decoded;

  if (from !== 'signup-request-addToGroup') throw new Error('Invalid request.');

  // Verify group is public
  const isPublic = await q.isPublicGroup(db, group, project);
  if (!isPublic) throw new Error(`You cannot be added to group ${group}.`);

  // Check awaiting request exists
  const { rows } = await db.query(
    "SELECT count(1) AS count FROM signup_requests WHERE state = 'awaiting' AND user_email = $1 AND project_name = $2",
    [email, project]
  );
  if (+(rows[0]?.count || 0) !== 1) throw new Error('Could not find request');

  // Transaction: accept request, create user, assign to group
  await db.beginTransaction();
  try {
    await db.query(
      "UPDATE signup_requests SET state = 'accepted', resolved_by = 'signup-verified' WHERE user_email = $1 AND project_name = $2",
      [email, project]
    );
    const passwordHash = hashPassword(password);
    await q.createUser(db, email, passwordHash);
    await q.assignUserToGroup(db, email, group, 'signup-verified');
    await db.commitTransaction();

    const { rows: users } = await q.getUserByEmail(db, email);
    const user = await buildUserObject(db, email, passwordHash, project, users[0]?.id);
    return { message: 'Your request has been completed.', user };
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

/** POST /signup/accept — admin accepts a signup request */
async function signupAccept(db, { token, group_name, user_email, project_name }) {
  user_email = user_email.toLowerCase();
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, project_name);

  // Check group's auth level
  const { rows: gipRows } = await db.query(
    'SELECT auth_level FROM groups_in_projects WHERE group_name = $1 AND project_name = $2',
    [group_name, project_name]
  );
  const groupAuthLevel = gipRows.length ? gipRows[0].auth_level : 0;

  if (authLevel < 5 || authLevel < groupAuthLevel) {
    throw new Error(`You do not have authority to assign users to group ${group_name}.`);
  }

  // Check pending or rejected request exists
  const { rows: reqRows } = await db.query(
    "SELECT count(1) AS count FROM signup_requests WHERE (state = 'pending' OR state = 'rejected') AND user_email = $1 AND project_name = $2",
    [user_email, project_name]
  );
  if (+(reqRows[0]?.count || 0) !== 1) throw new Error('Could not find request.');

  await db.beginTransaction();
  try {
    await q.updateSignupRequest(db, user_email, project_name, 'accepted', userData.email);

    // Check if user already exists
    const { rows: existingUsers } = await q.getUserByEmail(db, user_email);
    if (existingUsers.length) {
      await q.assignUserToGroup(db, user_email, group_name, userData.email);
      // Email notification would go here (Phase 5)
    } else {
      // Create new user with generated password
      const newPassword = passwordGen();
      const newPasswordHash = hashPassword(newPassword);
      await q.createUser(db, user_email, newPasswordHash);
      await q.assignUserToGroup(db, user_email, group_name, userData.email);
      // Email with password would go here (Phase 5)
    }
    await db.commitTransaction();
    return { message: `Signup request for ${user_email} has been accepted.` };
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

/** POST /signup/reject — admin rejects a signup request */
async function signupReject(db, { token, user_email, project_name }) {
  user_email = user_email.toLowerCase();
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, project_name);

  if (authLevel < 5) throw new Error(`You do not have the required authority to reject invites to ${project_name}.`);

  await q.updateSignupRequest(db, user_email, project_name, 'rejected', userData.email);
  // Email notification would go here (Phase 5)
  return { message: `Signup request for ${user_email} has been rejected.` };
}

/** POST /signup/delete — delete a rejected signup request */
async function deleteSignup(db, { token, user_email, project_name }) {
  user_email = user_email.toLowerCase();
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, project_name);

  if (authLevel < 5) throw new Error(`You do not have the authority to delete requests for project ${project_name}.`);

  const { rows } = await db.query(
    "SELECT count(1) AS count FROM signup_requests WHERE user_email = $1 AND project_name = $2 AND state = 'rejected'",
    [user_email, project_name]
  );
  if (+(rows[0]?.count || 0) === 0) throw new Error('You may only delete rejected requests.');

  await db.query(
    "DELETE FROM signup_requests WHERE user_email = $1 AND project_name = $2 AND state = 'rejected'",
    [user_email, project_name]
  );
  return { message: 'Request deleted.' };
}

/** POST /invite — admin sends invite to user */
async function sendInvite(db, { token, group_name, user_email, project_name }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, project_name);

  if (authLevel < 5) throw new Error(`You do not have the authority to invite user to project ${project_name}.`);

  user_email = user_email.toLowerCase();

  // Check user doesn't already exist
  const { rows: existingUsers } = await q.getUserByEmail(db, user_email);
  if (existingUsers.length) throw new Error(`User ${user_email} already exists.`);

  // Check no existing signup request
  const { rows: existingRequests } = await db.query(
    'SELECT count(1) AS count FROM signup_requests WHERE user_email = $1 AND project_name = $2',
    [user_email, project_name]
  );
  if (+(existingRequests[0]?.count || 0) > 0) throw new Error(`User ${user_email} has already been invited to project ${project_name}.`);

  await q.createSignupRequest(db, user_email, project_name, 'awaiting');
  const inviteToken = await signToken(
    { group: group_name, project: project_name, email: user_email, invited_by: userData.email, from: 'invite-request' },
    '24h'
  );
  // Email would be sent here (Phase 5)
  return { message: `Invite to project ${project_name} has been sent to ${user_email}.`, token: inviteToken };
}

/** POST /invite/accept — user accepts an invite */
async function acceptInvite(db, { token, password }) {
  const decoded = await verifyToken(token);
  const { project, group, email, from, invited_by } = decoded;

  if (from !== 'invite-request') throw new Error('Invalid request.');

  const { rows } = await db.query(
    "SELECT count(1) AS count FROM signup_requests WHERE state = 'awaiting' AND user_email = $1 AND project_name = $2",
    [email, project]
  );
  if (+(rows[0]?.count || 0) !== 1) throw new Error('Could not find awaiting request.');

  await db.beginTransaction();
  try {
    const passwordHash = hashPassword(password);
    await q.createUser(db, email, passwordHash);
    await q.assignUserToGroup(db, email, group, invited_by);
    await q.updateSignupRequest(db, email, project, 'accepted', invited_by);
    await db.commitTransaction();

    const { rows: users } = await q.getUserByEmail(db, email);
    const user = await buildUserObject(db, email, passwordHash, project, users[0]?.id);
    return { message: 'Your invite has been completed.', user };
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

/** POST /password/set — set initial password (from token link) */
async function passwordSet(db, { token, password }) {
  const userData = await verifyAndGetUserData(db, token);
  const passwordHash = hashPassword(password);
  await q.updateUserPassword(db, userData.email, passwordHash);
  const newToken = await createUserToken(userData.email, passwordHash, userData.project);
  return { token: newToken, message: 'Your password has been set.' };
}

/** POST /password/force — admin forces a user's password */
async function passwordForce(db, { token, userEmail, password }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, 'avail_auth');

  if (authLevel < 10) throw new Error('You do not have the authority to set the password for other users.');

  const passwordHash = hashPassword(password);
  await q.updateUserPassword(db, userEmail, passwordHash);
  const newToken = await createUserToken(userData.email, userData.password, userData.project);
  return { token: newToken, message: `You successfully set the password for user ${userEmail}.` };
}

/** POST /password/update — user changes own password */
async function passwordUpdate(db, { token, current, password }) {
  const userData = await verifyAndGetUserData(db, token);

  if (!comparePassword(current, userData.password)) throw new Error('Incorrect password.');

  const passwordHash = hashPassword(password);
  await q.updateUserPassword(db, userData.email, passwordHash);
  const newToken = await createUserToken(userData.email, passwordHash, userData.project);
  return { token: newToken, message: 'Your password has been updated.' };
}

/** POST /password/reset — generate random password, email it */
async function passwordReset(db, { email, project_name }) {
  email = email.toLowerCase();
  const { rows } = await q.getUserByEmail(db, email);
  const userData = rows[0];
  if (!userData) throw new Error('Unknown email.');

  const newPassword = passwordGen();
  const passwordHash = hashPassword(newPassword);
  await q.updateUserPassword(db, email, passwordHash);
  const newToken = await createUserToken(email, passwordHash, project_name);
  // Email with newPassword and newToken would be sent here (Phase 5)
  return { message: 'Your password has been reset. You should receive an email shortly.', password: newPassword, token: newToken };
}

/** POST /create/user — admin creates a user */
async function createUser(db, { token, email, password, project, group }) {
  const userData = await verifyAndGetUserData(db, token);
  const authLevel = await q.getUserAuthLevel(db, userData.email, 'avail_auth');

  if (authLevel < 10) throw new Error('You do not have the authority to create users.');

  email = email.toLowerCase();
  const passwordHash = hashPassword(password);

  await db.beginTransaction();
  try {
    await q.createUser(db, email, passwordHash);
    await q.assignUserToGroup(db, email, group, userData.email);
    // Update any existing signup request to accepted
    await db.query(
      "UPDATE signup_requests SET state = 'accepted', resolved_by = $1 WHERE user_email = $2 AND project_name = $3",
      [userData.email, email, project]
    );
    await db.commitTransaction();
    return { message: 'New user successfully created.' };
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

/** POST /init/setup — initial project setup (create project + admin + public groups + user) */
async function initSetup(db, { email, password, project }) {
  if (!email || !project) throw new Error('Invalid request.');
  email = email.toLowerCase();

  const groupAdmin = `${project} Admin`;
  const groupPublic = `${project} Public`;

  await db.beginTransaction();
  try {
    // Check if user already exists
    const { rows } = await q.getUserByEmail(db, email);
    let userEmail;
    if (rows[0] && comparePassword(password, rows[0].password)) {
      userEmail = rows[0].email;
    } else {
      const passwordHash = hashPassword(password);
      await q.createUser(db, email, passwordHash);
      userEmail = email;
    }

    // Create groups
    await q.createGroup(db, groupAdmin, null, 'init_setup_script');
    await q.createGroup(db, groupPublic, null, 'init_setup_script');

    // Create project
    await q.createProject(db, project, 'init_setup_script');

    // Assign groups to project
    await q.assignGroupToProject(db, groupAdmin, project, 10, 'init_setup_script');
    await q.assignGroupToProject(db, groupPublic, project, 0, 'init_setup_script');

    // Assign user to admin group
    await q.assignUserToGroup(db, userEmail, groupAdmin, 'init_setup_script');

    await db.commitTransaction();
    return { user: { email: userEmail } };
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

/** POST /requests — get signup requests visible to authenticated user */
async function getRequests(db, { token }) {
  const userData = await verifyAndGetUserData(db, token);
  const { rows } = await db.query(
    `SELECT * FROM signup_requests
     WHERE project_name IN (
       SELECT project_name FROM users_in_groups AS uig
       INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
       WHERE user_email = $1 AND gip.auth_level >= 5
     )`,
    [userData.email]
  );
  return { requests: rows };
}

/** POST /requests/byProject — get requests for a specific project */
async function getRequestsForProject(db, { token, project_name }) {
  const userData = await verifyAndGetUserData(db, token);
  const { rows } = await db.query(
    `SELECT * FROM signup_requests
     WHERE project_name IN (
       SELECT project_name FROM users_in_groups AS uig
       INNER JOIN groups_in_projects AS gip ON uig.group_name = gip.group_name
       WHERE uig.user_email = $1 AND gip.auth_level >= 5 AND project_name = $2
     )
     AND state != 'accepted'`,
    [userData.email, project_name]
  );
  return { requests: rows };
}

/** POST /signup/assign/group — create user and assign to group */
async function signupAssignGroup(db, { email, password, project, group, url }) {
  if (!email || !project) throw new Error('Invalid request.');
  email = email.toLowerCase();
  const groupName = group || `${project} Public`;
  let generatedPassword;

  if (!password) {
    generatedPassword = passwordGen();
  }

  await db.beginTransaction();
  try {
    // Check if user exists
    const { rows } = await q.getUserByEmail(db, email);
    let userEmail;
    if (rows[0] && password && comparePassword(password, rows[0].password)) {
      userEmail = rows[0].email;
    } else {
      const passwordHash = hashPassword(password || generatedPassword);
      await q.createUser(db, email, passwordHash);
      userEmail = email;
    }

    // Check if group exists, create if not
    const { rows: groupRows } = await db.query('SELECT count(1) AS count FROM groups WHERE name = $1', [groupName]);
    if (+(groupRows[0]?.count || 0) === 0) {
      await q.createGroup(db, groupName, null, 'signup_accept_script');
      await q.assignGroupToProject(db, groupName, project, 0, 'signup_accept_script');
    }

    await q.assignUserToGroup(db, userEmail, groupName, 'signup_accept_script');
    await db.commitTransaction();

    // Email with generated password would go here (Phase 5)
    return { message: 'success!' };
  } catch (e) {
    await db.rollbackTransaction();
    throw e;
  }
}

module.exports = {
  login,
  auth,
  signupRequest,
  signupRequestVerified,
  signupAccept,
  signupReject,
  deleteSignup,
  sendInvite,
  acceptInvite,
  getRequests,
  getRequestsForProject,
  passwordSet,
  passwordForce,
  passwordUpdate,
  passwordReset,
  createUser,
  initSetup,
  verifyEmail,
  signupAssignGroup,
  // Expose helpers for use by other handlers
  verifyAndGetUserData,
  buildUserObject,
};
