'use strict';

/**
 * Operation table for permissions-access-diff.js (task permissions-access-diff-audit).
 *
 * One row per operation the levels → permissions move touches. Each row says who may do it in three states:
 *   - `old`   — master before `permissions_move` (levels, login-only or open routes);
 *   - `now`   — this branch with every flag at its default (`log`; auth handlers in transition form,
 *               "permission or level");
 *   - `final` — every mode at `enforce` and levels removed (the end state of the move).
 *
 * Each rule is a function of a context `c` built by the script (see `evaluate` there):
 *   c.user                  — { id, email, groups (in this project), authed } (anon: groups [], authed false)
 *   c.level                 — the user's max level in the project (0 when none)
 *   c.member                — the user is in at least one group of the project
 *   c.availLevel / c.inAvail — level in `avail_auth`, membership of `AVAIL`
 *   c.authCan(perm)         — permissions.js `can` on the project's auth row, as a project member
 *   c.manages(group)        — canManageGroup on the auth row (the escalation rule, decision (b))
 *   c.levelCovers(group)    — today's level rule: level ≥ the group's in every project it is in
 *   c.source(perms) / c.pattern(perms) — sourceAuth's lenient rule on the target (pattern ⊕ source, `${app} Admin`)
 *   c.legacySource(perms)   — master's isUserAuthedForSource: the external source's own grants, lenient; DMS env ⇒ allow
 *   c.target                — { kind, ... } the row the operation is on
 *
 * `ui` (optional): the client gate's decision on this branch. The client has no mode flag, so a control it hides is
 * lost on deploy even while the server only logs (review 2026-10-27).
 *
 * `scope` picks the targets: 'auth' (once per project), 'auth-group' (per group of the project), 'platform' (once),
 * 'pattern' (per datasets pattern), 'source' (per source). `intended` marks a loss the owning task makes on purpose,
 * as `(c) => reason | null`; a loss with a reason is listed as intended, not as one to fix. `hole` marks a loss of
 * access the old rule gave without discriminating (anyone signed in, or the level path's missing floor): the move
 * closes it, but someone may rely on it, so the report lists who used it recently instead of proposing a grant
 * for everyone.
 *
 * Sources of the rules: master handlers via `git show $(git merge-base HEAD origin/master):…`, the branch handlers,
 * and the task files named in `task`. Keep a row in step when its rule changes.
 */

const anonWrite = (c) => (!c.user.authed ? 'anonymous writes need a sign-in now (owner)' : null);
const anyoneSignedIn = () => 'anyone signed in could';
const noFloor = (c) => (c.level < 5 ? 'level path had no floor (level N managed groups at level <= N)' : null);

const OPS = [
    // ---- Auth row (per project) ------------------------------------------------------------------------------
    {
        key: 'list-users', scope: 'auth', task: 14, perm: 'auth-users',
        old: (c) => c.member,                                   // getUsers: any signed-in user, filtered by level
        now: (c) => c.authCan('auth-users') || c.level >= 5,
        final: (c) => c.authCan('auth-users'),
        intended: (c) => (c.level < 5 ? 'Users list is for auth-users holders; below level 5 saw only a level-filtered list' : null),
    },
    {
        key: 'list-users-by-project', scope: 'auth', task: 14, perm: 'auth-users',
        old: (c) => c.level >= 10,
        now: (c) => c.authCan('auth-users') || c.level >= 10,
        final: (c) => c.authCan('auth-users'),
    },
    {
        key: 'signup-requests', scope: 'auth', task: 14, perm: 'auth-users',  // list / reject / delete requests
        old: (c) => c.level >= 5,
        now: (c) => c.authCan('auth-users') || c.level >= 5,
        final: (c) => c.authCan('auth-users'),
    },
    {
        key: 'list-groups', scope: 'auth', task: 15, perm: 'auth-groups|auth-users',
        old: (c) => c.member,                                   // getGroups / byproject: filtered by level
        now: (c) => c.member,                                   // level-visible groups still listed
        final: (c) => c.authCan('auth-groups') || c.authCan('auth-users'),
        intended: (c) => (c.level < 5 ? 'group lists are for auth-groups / auth-users holders' : null),
    },
    {
        key: 'adjust-group-level', scope: 'auth', task: 15, perm: '(none: levels removed)',
        old: (c) => c.level >= 5,
        now: (c) => c.level >= 5,
        final: () => false,
        intended: () => 'levels are removed (task 19)',
    },
    // ---- Per group of the project ----------------------------------------------------------------------------
    {
        key: 'manage-members', scope: 'auth-group', task: 14, perm: 'auth-users',  // add / remove users, accept / invite into it
        old: (c) => c.levelCovers(c.target.group),
        now: (c) => (c.authCan('auth-users') && c.manages(c.target.group)) || c.levelCovers(c.target.group),
        final: (c) => c.authCan('auth-users') && c.manages(c.target.group),
        hole: noFloor,
    },
    {
        key: 'link-unlink-group', scope: 'auth-group', task: 15, perm: 'auth-groups',  // assign / remove a group to / from the project
        old: (c) => c.level >= 5 && c.level >= c.target.level,
        now: (c) => (c.authCan('auth-groups') && c.manages(c.target.group)) || (c.level >= 5 && c.level >= c.target.level),
        final: (c) => c.authCan('auth-groups') && c.manages(c.target.group),
    },
    {
        key: 'delete-group', scope: 'auth-group', task: 15, perm: 'auth-groups',
        old: (c) => c.level >= 5,                               // master: unlinks from the caller's level ≥ 5 projects
        now: (c) => c.authCan('auth-groups') && c.manages(c.target.group),
        final: (c) => c.authCan('auth-groups') && c.manages(c.target.group),
    },
    // ---- Platform (auth DB as a whole) -----------------------------------------------------------------------
    {
        key: 'platform-groups', scope: 'platform', task: 16, perm: 'AVAIL membership',  // create / update group
        old: (c) => c.availLevel >= 5,
        now: (c) => c.inAvail || c.availLevel >= 5,
        final: (c) => c.inAvail,
    },
    {
        key: 'platform-users-projects', scope: 'platform', task: 16, perm: 'AVAIL membership',  // create user, force password, fake users, projects
        old: (c) => c.availLevel >= 10,
        now: (c) => c.inAvail || c.availLevel >= 10,
        final: (c) => c.inAvail,
    },
    // ---- Datasets pattern ------------------------------------------------------------------------------------
    {
        key: 'create-source', scope: 'pattern', task: 5, perm: 'create-source',  // CSV / GIS / file create
        old: () => true,                                        // upload routes were open
        now: (c) => c.user.authed,
        final: (c) => c.user.authed && c.pattern(['create-source']),
        intended: anonWrite,
        hole: anyoneSignedIn,
        ui: (c) => c.user.authed && c.pattern(['create-source']),
    },
    {
        key: 'edit-pattern', scope: 'pattern', task: 8, perm: 'edit-pattern',  // settings, duplicate
        old: () => true,
        now: (c) => c.user.authed,
        final: (c) => c.user.authed && c.pattern(['edit-pattern']),
        intended: anonWrite,
        hole: anyoneSignedIn,
        ui: (c) => c.user.authed && c.pattern(['edit-pattern']),
    },
    // ---- Sources (internal: DMS env; external: pgEnv) --------------------------------------------------------
    {
        key: 'update-source', scope: 'source', task: 4, perm: 'update-source',  // metadata, rename, rules, index / PK
        old: (c) => (c.target.external ? c.legacySource(['update-source']) : true),
        now: (c) => c.user.authed && (c.target.external ? c.legacySource(['update-source']) || c.source(['update-source']) : true),
        final: (c) => c.user.authed && c.source(['update-source']),
        intended: anonWrite,
        hole: (c) => (c.target.external ? null : 'anyone signed in could (DMS env)'),
        ui: (c) => c.user.authed && c.source(['update-source']),
    },
    {
        key: 'edit-source-data', scope: 'source', task: 5, perm: 'edit-source-data|update-source',  // upload into, clear, row writes
        old: () => true,
        now: (c) => c.user.authed || !c.target.external,        // dms.data guard logs only; upload routes need a sign-in
        final: (c) => c.source(['edit-source-data', 'update-source']) && (c.user.authed || c.source(['edit-source-data'], { explicit: true })),
        intended: anonWrite,
        hole: anyoneSignedIn,
        ui: (c) => c.user.authed && c.source(['edit-source-data', 'delete-source']),
    },
    {
        key: 'create-view', scope: 'source', task: 5, perm: 'create-view|update-source',
        old: () => true,
        now: (c) => c.user.authed,
        final: (c) => c.user.authed && c.source(['create-view', 'update-source']),
        intended: anonWrite,
        hole: anyoneSignedIn,
    },
    {
        key: 'delete-source', scope: 'source', task: 4, perm: 'delete-source',  // source and version deletes
        old: (c) => (c.target.external ? c.user.authed && c.legacySource(['delete-source']) : c.user.authed),
        now: (c) => c.user.authed,
        final: (c) => c.user.authed && c.source(['delete-source']),
        hole: (c) => (c.target.external ? null : 'anyone signed in could (DMS env)'),
        ui: (c) => c.user.authed && c.source(['delete-source']),
    },
    {
        key: 'edit-source-permissions', scope: 'source', task: 4, perm: 'edit-source-permissions',
        old: (c) => c.user.authed,                              // uda.sources.update had no check
        now: (c) => c.user.authed,
        final: (c) => c.user.authed && c.source(['edit-source-permissions']),
        hole: anyoneSignedIn,
    },
    {
        key: 'manage-downloads', scope: 'source', task: 6, perm: 'manage-downloads',
        old: () => true,
        now: () => true,                                        // wasOpen: log mode allows
        final: (c) => c.user.authed && c.source(['manage-downloads']),
        intended: anonWrite,
        hole: anyoneSignedIn,
    },
    {
        key: 'download-links', scope: 'source', task: 10, perm: 'download-source',  // Overview / Versions download links
        old: () => true,
        now: () => true,                                        // the files stay public
        final: () => true,
        ui: (c) => c.source(['download-source']),
    },
    {
        key: 'view-source', scope: 'source', task: 12, perm: 'view-source (or any source permission)',  // catalog, metadata, data, tiles
        old: () => true,
        now: () => true,
        final: (c) => c.source(['view-source', 'download-source', 'update-source', 'edit-source-data', 'create-view',
            'manage-downloads', 'view-source-api', 'delete-source', 'edit-source-permissions']),
        hole: () => 'reads were open to everyone',
    },
];

module.exports = { OPS };
