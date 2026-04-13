/**
 * Host ID — stable UUID identifying this server instance.
 * Generated once, persisted to var/dama_host_id.
 * Used to scope task queue ownership so tasks queued on one server
 * are only picked up by that server.
 */

const { join } = require('path');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { randomUUID } = require('crypto');

const HOST_ID_DIR = join(__dirname, '../../var');
const HOST_ID_PATH = join(HOST_ID_DIR, 'dama_host_id');

let hostId;

if (existsSync(HOST_ID_PATH)) {
  const lines = readFileSync(HOST_ID_PATH, 'utf8').split('\n');
  hostId = lines.filter(l => !l.startsWith('#') && l.trim()).shift();
}

if (!hostId) {
  hostId = randomUUID();
  mkdirSync(HOST_ID_DIR, { recursive: true });
  writeFileSync(HOST_ID_PATH, `# This file is auto-generated. Do not modify or delete.\n${hostId}\n`);
}

module.exports = { hostId };
