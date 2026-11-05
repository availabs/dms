'use strict';
/**
 * THE MODE, APPLIED — the only place a decision turns into an allow or a refusal, and the only
 * place one is logged.
 *
 *     applyMode(decision, ctx) → boolean
 *
 * `enforce` refuses what the judge refused. `log` (the default) allows it and writes a would-deny
 * line to the console and a row to the access log, so grants can be fixed before anything flips.
 * No surface keeps an older rule: `strict` (a source's own grants refusing under `log`, as the datasets
 * writes did before the mode) went with the pgEnv mirror on 2026-11-05.
 */
const { authMode } = require('./settings');
const accessLog = require('../../access-log');

const DEDUPE_MS = 10 * 60 * 1000;
const seen = new Map();

/**
 * @param {{ allow: boolean, reason?: string }} decision
 * @param {object} ctx
 * @param {string} ctx.guard   data | source | read | auth | upload | route — the access-log bucket
 * @param {string} ctx.kind    what was asked, e.g. `edit page`, `source`, `view`
 * @param {string} ctx.target  what it was asked about, e.g. `1234 docs|page`, `siteA+x/5`
 * @param {string[]} [ctx.perms]
 * @param {object|null} [ctx.user]
 * @param {string} [ctx.app]
 * @param {string} [ctx.mode]  override: `'log'` for a surface that must never enforce, `'enforce'` for one that always did
 * @param {boolean} [ctx.dedupe]  one console line per (kind, target, user) per ten minutes
 */
function applyMode(decision, ctx) {
  if (decision && decision.allow) return true;
  let mode = ctx.mode === 'log' || ctx.mode === 'enforce' ? ctx.mode : authMode();
  const reason = (decision && decision.reason) || 'refused';
  const { guard = 'data', kind = '', target = '', perms = [], user = null, app = '' } = ctx;
  const outcome = mode === 'log' ? 'would-deny' : 'refused';
  accessLog.record({ app, guard, outcome, kind, target, perms: [].concat(perms), user, reason });
  if (mode !== 'log') return false;

  const who = (user && (user.id ?? user.email)) ?? 'anon';
  if (ctx.dedupe) {
    const key = `${kind}|${target}|${who}`;
    const now = Date.now();
    if (now - (seen.get(key) || 0) < DEDUPE_MS) return true;
    seen.set(key, now);
    if (seen.size > 50000) seen.clear();
  }
  console.warn(`[auth] would-deny ${kind} ${target}${perms.length ? ` perms=${[].concat(perms).join(',')}` : ''} ` +
    `user=${who} groups=${((user && user.groups) || []).join('|')} reason=${reason}`);
  return true;
}

/** A refusal that reached no judge (not signed in, no row named): logged the same way. */
const refuse = (reason, ctx) => applyMode({ allow: false, reason }, ctx);

module.exports = { applyMode, refuse };
