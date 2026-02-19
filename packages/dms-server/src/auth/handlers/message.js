/**
 * Message handlers.
 * Each function takes (db, body) where body is req.body from Express.
 * Uses the messages_new table (newer messaging system).
 */

const { verifyAndGetUserData } = require('./auth');
const q = require('../utils/queries');

/** POST /messages — get messages for authenticated user */
async function getMessages(db, { token, project }) {
  const userData = await verifyAndGetUserData(db, token);
  const { rows } = await q.getMessages(db, userData.email, project || null);
  return rows;
}

/** POST /messages/post — send a message (to user, users, group, project, or all) */
async function postMessage(db, { token, heading, message, type, target, project }) {
  const userData = await verifyAndGetUserData(db, token);

  switch (type) {
    case 'user':
      return sendToUser(db, userData, heading, message, target, project);
    case 'users':
      return sendToUsers(db, userData, heading, message, target, project);
    case 'group':
      return sendToGroup(db, userData, heading, message, target, project);
    case 'project':
      return sendToProject(db, userData, heading, message, project);
    case 'all':
      return sendToAll(db, userData, heading, message);
    default:
      throw new Error(`Unknown message type ${type}.`);
  }
}

/** POST /messages/view — mark messages as viewed */
async function viewMessages(db, { token, ids }) {
  const userData = await verifyAndGetUserData(db, token);
  // Only mark messages sent to this user
  if (!Array.isArray(ids) || !ids.length) return 'No messages to mark.';
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  await db.query(
    `UPDATE messages_new SET viewed = TRUE WHERE id IN (${placeholders}) AND sent_to = $${ids.length + 1}`,
    [...ids, userData.email]
  );
  return 'Message(s) set as viewed.';
}

/** POST /messages/delete — soft-delete messages */
async function deleteMessages(db, { token, ids }) {
  const userData = await verifyAndGetUserData(db, token);
  if (!Array.isArray(ids) || !ids.length) return 'No messages to delete.';
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  await db.query(
    `UPDATE messages_new SET deleted = TRUE WHERE id IN (${placeholders}) AND sent_to = $${ids.length + 1}`,
    [...ids, userData.email]
  );
  return 'Message(s) deleted.';
}

// ---------------------------------------------------------------------------
// Send helpers
// ---------------------------------------------------------------------------

async function resolveEmail(db, target) {
  // target can be an email or a user id
  if (!isNaN(target)) {
    const { rows } = await db.query('SELECT email FROM users WHERE id = $1', [target]);
    if (!rows.length) throw new Error(`User "${target}" was not found.`);
    return rows[0].email;
  }
  const { rows } = await db.query('SELECT email FROM users WHERE email = $1', [target]);
  if (!rows.length) throw new Error(`User "${target}" was not found.`);
  return rows[0].email;
}

async function sendToUser(db, senderData, heading, message, target, project) {
  const email = await resolveEmail(db, target);
  await q.sendMessage(db, { heading, message, sentBy: senderData.email, sentTo: email, project });
  // Email/Slack notification would go here (Phase 5)
  return 'Message sent.';
}

async function sendToUsers(db, senderData, heading, message, targets, project) {
  for (const target of targets) {
    await sendToUser(db, senderData, heading, message, target, project);
  }
  return 'Messages sent.';
}

async function sendToGroup(db, senderData, heading, message, groupName, project) {
  // Check authority: user's auth level must be >= group's auth level in project
  const { rows: gipRows } = await db.query(
    'SELECT auth_level FROM groups_in_projects WHERE group_name = $1 AND project_name = $2',
    [groupName, project]
  );
  if (!gipRows.length) throw new Error(`Group ${groupName} was not found.`);

  const myAuthLevel = await q.getUserAuthLevel(db, senderData.email, project);
  if (myAuthLevel < gipRows[0].auth_level) {
    throw new Error(`You do not have the authority to message group ${groupName}.`);
  }

  const { rows: members } = await db.query(
    'SELECT user_email FROM users_in_groups WHERE group_name = $1 AND user_email != $2',
    [groupName, senderData.email]
  );
  for (const { user_email } of members) {
    await sendToUser(db, senderData, heading, message, user_email, project);
  }
  return `Sent message to group ${groupName}.`;
}

async function sendToProject(db, senderData, heading, message, project) {
  const myAuthLevel = await q.getUserAuthLevel(db, senderData.email, project);

  // Need auth level >= max auth level in project
  const { rows: maxRows } = await db.query(
    'SELECT COALESCE(MAX(auth_level), -1) AS max_level FROM groups_in_projects WHERE project_name = $1',
    [project]
  );
  if (+(maxRows[0]?.max_level || -1) === -1) throw new Error(`Project ${project} was not found.`);
  if (myAuthLevel < maxRows[0].max_level) {
    throw new Error(`You do not have the authority to message project ${project}.`);
  }

  const { rows: members } = await db.query(
    `SELECT DISTINCT user_email FROM users_in_groups
     INNER JOIN groups_in_projects USING (group_name)
     WHERE project_name = $1 AND user_email != $2`,
    [project, senderData.email]
  );
  for (const { user_email } of members) {
    await sendToUser(db, senderData, heading, message, user_email, project);
  }
  return `Sent message to project ${project}.`;
}

async function sendToAll(db, senderData, heading, message) {
  // Must be in AVAIL group
  const { rows } = await db.query(
    'SELECT count(1) AS count FROM users_in_groups WHERE group_name = $1 AND user_email = $2',
    ['AVAIL', senderData.email]
  );
  if (+(rows[0]?.count || 0) === 0) throw new Error('You do not have the authority to message all users.');

  const { rows: users } = await db.query(
    'SELECT DISTINCT email FROM users WHERE email != $1',
    [senderData.email]
  );
  for (const { email } of users) {
    await sendToUser(db, senderData, heading, message, email, null);
  }
  return 'Sent message to all users.';
}

module.exports = {
  getMessages,
  postMessage,
  viewMessages,
  deleteMessages,
};
