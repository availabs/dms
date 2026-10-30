'use strict';

/**
 * Blank-row rules for permissions-access-diff.js (task permissions-blank-row-read-only, plan step 4).
 *
 * Owner decision 2026-10-29: a row with no grants, and none inherited, can be read by anyone and edited by no one,
 * except `${app} Admin`, site `*` holders and, for a pattern row, site `view-pattern-list` holders. The audit
 * decides every recent write in change_log twice, with the rules in routes/dms/authRules.js and the authJudge.js
 * interpreter (task pattern-auth-rules-as-data): once with today's `holds` (no grants ⇒ anyone signed in) and once
 * with the read-only one (no grants ⇒ explicit grants only, `public` included). A write only the first allows is
 * one the change would refuse. Nothing here knows a row kind: the kinds and their owners are the rules file's.
 *
 * change_log keeps the row, not the patch, so a write's changed keys are unknown: an edit is judged with no keys,
 * the rules' `noChange` set (any of the row's edit permissions).
 * */

const AUTH_RULES = require('../routes/dms/authRules');
const { judge } = require('../routes/dms/authJudge');
const { isUserAuthed } = require('../routes/dms/auth');
const { holdsExplicitly } = require('../routes/uda/sourceAuth');

// Grants besides the `public` group: dataAuth.js hasGrants.
const hasGrants = (ap) =>
    Object.keys((ap && ap.groups) || {}).some(g => g !== 'public') || Object.keys((ap && ap.users) || {}).length > 0;

const lenient = (user) => (ap, perms) => isUserAuthed({ user, reqPermissions: perms, authPermissions: ap });
const strict = (user) => (ap, perms) => (hasGrants(ap)
    ? isUserAuthed({ user, reqPermissions: perms, authPermissions: ap })
    : holdsExplicitly({ user, reqPermissions: perms, authPermissions: ap }));

/**
 * One write by `user`, under both rules.
 *   write:  { kind, op: create|edit|delete, split, row (the row's stored data, for clauses that read it) }
 *   owners: { grants: owner name → authPermissions (null: not found), where: owner name → where a grant goes,
 *             isAppAdmin }
 * Returns null when the rules have no rule for the kind (their DEFAULT: "signed in"), else
 *   { blank: the empty owners the decision read, lost, keptBy, fix: { where, perm } for a lost write }.
 */
function judgeBlank(write, user, owners) {
    const rule = AUTH_RULES[write.kind];
    if (!rule || (rule.appliesWhen === 'split' && !write.split)) return null;

    // a copy per owner, so each grants object names its owner when the interpreter hands it to `holds`
    const grants = {}, nameOf = new Map();
    for (const [name, ap] of Object.entries(owners.grants)) {
        grants[name] = ap && { ...ap };
        if (grants[name]) nameOf.set(grants[name], name);
    }
    const blankOwners = new Set();
    // the interpreter asks this when a rule has a clause for an owner with no grants (`ifOwnerBlank`)
    const isBlank = (ap, name) => {
        const blank = ap != null && !hasGrants(ap);
        if (blank) blankOwners.add(name);
        return blank;
    };
    const run = (can, isAppAdmin = owners.isAppAdmin) => {
        const calls = [];
        const holds = (ap, perms) => {
            const ok = ap != null && can(ap, perms);
            calls.push({ owner: nameOf.get(ap), ap, perms, ok });
            return ok;
        };
        const res = judge(AUTH_RULES, { user, isAppAdmin, grants, holds, isBlank },
            { kind: write.kind, op: write.op, keys: [], patch: {}, split: write.split, row: write.row || {} });
        return { ...res, calls };
    };
    // every owner the rule reads: with nothing held and no app Admin, the interpreter passes the escape and the
    // row's own requirement instead of stopping at whichever allows first
    const probe = run(() => false, false);
    const before = run(lenient(user));
    const after = run(strict(user));
    const lost = before.allow && !after.allow;
    const failed = after.calls.filter(c => !c.ok).pop();
    const by = { 'app admin': 'app Admin', escape: `site ${[].concat((rule.escape || {}).perms || []).join(' or ')}` };
    return {
        blank: [...new Set([
            ...probe.calls.filter(c => c.ap && !hasGrants(c.ap)).map(c => c.owner),
            ...blankOwners,
        ].map(name => owners.where[name]))],
        lost,
        allowedBefore: before.allow,
        keptBy: after.allow ? by[after.reason] || 'grant' : '',
        // the grant that keeps it: the first permission of the requirement that refused, on that owner
        fix: lost && failed ? { where: owners.where[failed.owner], perm: failed.perms[0] } : null,
    };
}

module.exports = { judgeBlank, hasGrants };
