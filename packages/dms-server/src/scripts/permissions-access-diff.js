#!/usr/bin/env node
/**
 * Access diff for the levels → permissions move (task permissions-access-diff-audit). READ-ONLY.
 *
 * For every user of a project (plus an anonymous visitor), every operation in permissions-access-diff.ops.js and
 * every target (the auth row, each group, each datasets pattern, each source), it decides the operation in three
 * states: `old` (master), `now` (this branch at its default flags) and `final` (enforce, no levels). A cell is a
 * loss when `old` allows and a later state doesn't; a gain the other way round.
 *
 *   node src/scripts/permissions-access-diff.js --auth <cfg> --dms <cfg> --app <app>
 *        [--project <name>]            auth project (default: the app)
 *        [--pgenv <cfg>[,<cfg>]]       DAMA envs whose sources the site's datasets patterns show
 *        [--subdomain <s>]             resolve subdomain-keyed grants
 *        [--overlay <grants.json>]     grants to apply before deciding (the grant migration's dry run)
 *        [--out <dir>]                 default: dms-template scratchpad/permissions-access-diff/<date>/<app>
 *
 * Users are decided one by one with every group they hold, so someone who keeps an operation through another
 * group is never listed as losing it. Writes matrix.csv, losses.csv, gains.csv, remediation.md and grants.json.
 *
 * Read-only by construction: it opens its own adapters from the config files instead of `getDb`, which would run
 * the schema init and migrations, and it only ever runs SELECTs.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../db');
const { resolveTable } = require('../db/table-resolver');
const { resolveAuthPermissions, isUserAuthed } = require('../routes/dms/auth');
const { mergeAuthPermissions, unionAuthPermissions, holdsExplicitly, isAppAdmin } = require('../routes/uda/sourceAuth');
const { getInstance } = require('../db/type-utils');
const { OPS } = require('./permissions-access-diff.ops');

const PROTECTED_PERMISSIONS = ['*', 'auth-groups', 'edit-pattern-permissions'];
const asList = (p) => (Array.isArray(p) ? p : p ? [p] : []);
const parseJson = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
    return v;
};
const normalize = (ap) => ({ groups: (ap && ap.groups) || {}, users: (ap && ap.users) || {} });

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith('--')) args[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
    return args;
}

function openAdapter(configName) {
    const config = loadConfig(configName);
    const { PostgresAdapter } = require('../db/adapters/postgres');
    const { SqliteAdapter } = require('../db/adapters/sqlite');
    return { db: config.type === 'postgres' ? new PostgresAdapter(config) : new SqliteAdapter(config), config };
}

// ------------------------------------------------------------------------------------------------
// Loading
// ------------------------------------------------------------------------------------------------

async function loadAuth(db, project) {
    const { rows: links } = await db.query('SELECT group_name, project_name, auth_level FROM groups_in_projects');
    const { rows: members } = await db.query('SELECT user_email, group_name FROM users_in_groups');
    const { rows: users } = await db.query('SELECT id, email FROM users');

    const linksByGroup = {};
    for (const l of links) (linksByGroup[l.group_name] ||= []).push({ project: l.project_name, level: +l.auth_level || 0 });
    const projectGroups = links.filter(l => l.project_name === project)
        .map(l => ({ group: l.group_name, level: +l.auth_level || 0 }));
    const groupsOf = {};
    for (const m of members) (groupsOf[m.user_email.toLowerCase()] ||= []).push(m.group_name);

    const levelIn = (email, proj) => Math.max(0, ...(groupsOf[email] || [])
        .flatMap(g => (linksByGroup[g] || []).filter(l => l.project === proj).map(l => l.level)));
    const levelsOf = (email) => {
        const out = {};
        for (const g of groupsOf[email] || []) for (const l of linksByGroup[g] || []) out[l.project] = Math.max(out[l.project] || 0, l.level);
        return out;
    };

    const inProject = new Set(projectGroups.map(g => g.group));
    const projectUsers = users
        .map(u => ({ id: u.id, email: u.email.toLowerCase() }))
        .filter(u => (groupsOf[u.email] || []).some(g => inProject.has(g)))
        .map(u => ({
            ...u,
            groups: (groupsOf[u.email] || []).filter(g => inProject.has(g)),
            level: levelIn(u.email, project),
            levels: levelsOf(u.email),
            availLevel: levelIn(u.email, 'avail_auth'),
            inAvail: (groupsOf[u.email] || []).includes('AVAIL'),
        }));
    return { projectGroups, linksByGroup, projectUsers, membersOf: (g) => members.filter(m => m.group_name === g).length };
}

async function loadDms(db, config, app, subdomain) {
    const splitMode = config.splitMode || process.env.DMS_SPLIT_MODE || 'legacy';
    const tbl = resolveTable(app, 'pattern', db.type, splitMode).fullName;
    const { rows } = await db.query(
        `SELECT id, type, data FROM ${tbl} WHERE app = $1 AND (type LIKE '%:pattern' OR type LIKE '%:dmsenv' OR type LIKE '%:source')`,
        [app]);
    const all = rows.map(r => ({ id: +r.id, type: r.type, data: parseJson(r.data) || {} }));
    const byId = new Map(all.map(r => [r.id, r]));
    const patterns = all.filter(r => r.type.endsWith(':pattern'));

    const auth = patterns.filter(p => p.data.pattern_type === 'auth');
    const admin = patterns.filter(p => p.data.pattern_type === 'admin');
    const datasets = patterns.filter(p => p.data.pattern_type === 'datasets');

    // getSiteSources, read-only: the pattern's own `sources`, or its dmsEnv's; dangling refs dropped
    const sourcesOf = (p) => {
        const holder = p.data.dmsEnvId ? byId.get(+p.data.dmsEnvId) : p;
        return asList(holder && parseJson(holder.data.sources))
            .map(s => byId.get(+(s && s.id)))
            .filter(s => s && s.type.endsWith(':source'));
    };

    const internal = new Map();  // source id → { row, patterns }
    for (const p of datasets) {
        for (const s of sourcesOf(p)) {
            const e = internal.get(s.id) || { row: s, patterns: [] };
            e.patterns.push(p);
            internal.set(s.id, e);
        }
    }
    const resolve = (raw) => resolveAuthPermissions(raw, subdomain);
    return {
        authRow: auth[0] || null,
        authRows: auth.length,
        adminGrants: admin.map(r => normalize(resolve(r.data.authPermissions))),
        datasets: datasets.map(p => ({ id: p.id, name: p.data.name || p.data.base_url || p.type, ap: resolve(p.data.authPermissions) })),
        internalSources: [...internal.values()].map(({ row, patterns }) => ({
            external: false, env: app, id: row.id, slug: getInstance(row.type), name: row.data.name || row.data.doc_type || row.type,
            ap: parseJson(row.data.auth_permissions) || {},
            patternAP: unionAuthPermissions(patterns.map(p => resolve(p.data.authPermissions))),
        })),
    };
}

// Who wrote what recently (change_log keeps DMS_SYNC_COMPACT_DAYS, 30 by default): `${user}|${key}` → last write.
// Keys: `row:<id>` (a source or pattern row), `data:<slug>` / `view:<slug>` (a source's rows / versions).
async function loadUsage(db, app) {
    const tbl = db.type === 'postgres' ? 'dms.change_log' : 'change_log';
    const used = new Map();
    const note = (user, key, at) => { const k = `${user}|${key}`; if (!used.has(k) || used.get(k) < at) used.set(k, at); };
    try {
        const { rows } = await db.query(
            `SELECT created_by, item_id, type, MAX(created_at) AS last FROM ${tbl}
             WHERE app = $1 AND created_by IS NOT NULL AND (type LIKE '%:source' OR type LIKE '%:pattern')
             GROUP BY created_by, item_id, type`, [app]);
        for (const r of rows) note(+r.created_by, `row:${+r.item_id}`, String(r.last));
        const { rows: kids } = await db.query(
            `SELECT created_by, type, MAX(created_at) AS last FROM ${tbl}
             WHERE app = $1 AND created_by IS NOT NULL AND (type LIKE '%:data' OR type LIKE '%:view')
             GROUP BY created_by, type`, [app]);
        for (const r of kids) {
            const [slug] = r.type.split('|');
            note(+r.created_by, `${r.type.endsWith(':data') ? 'data' : 'view'}:${slug}`, String(r.last));
        }
    } catch (e) {
        console.warn(`change_log not read (${e.message}): recent use is unknown`);
    }
    return used;
}

// The change_log key that shows `op` was used on `target`, or null when change_log can't tell.
function usageKey(op, target) {
    if (target.kind === 'pattern' && op.key === 'edit-pattern') return `row:${target.id}`;
    if (target.kind !== 'source' || target.external) return null;
    if (op.key === 'update-source' || op.key === 'edit-source-permissions') return `row:${target.id}`;
    if (op.key === 'edit-source-data') return `data:${target.slug}`;
    if (op.key === 'create-view') return `view:${target.slug}`;
    return null;
}

async function loadExternal(configName, patternAP) {
    const { db } = openAdapter(configName);
    const table = db.type === 'postgres' ? 'data_manager.sources' : 'sources';
    const { rows } = await db.query(`SELECT source_id, name, auth_permissions FROM ${table} ORDER BY source_id`);
    await db.end();
    return rows.map(r => ({
        external: true, env: configName, id: +r.source_id, name: r.name,
        ap: parseJson(r.auth_permissions) || {}, patternAP,
    }));
}

// ------------------------------------------------------------------------------------------------
// Deciding
// ------------------------------------------------------------------------------------------------

function applyOverlay(ap, add) {
    if (!add) return ap;
    const out = { groups: { ...(ap.groups || {}) }, users: { ...(ap.users || {}) } };
    for (const key of ['groups', 'users']) {
        for (const [k, perms] of Object.entries(add[key] || {})) out[key][k] = [...new Set([...asList(out[key][k]), ...perms])];
    }
    return out;
}

function makeContext({ u, app, scope, linksByGroup, target }) {
    const user = u.anon
        ? { id: null, groups: [], authed: false }
        : { id: u.id, email: u.email, groups: u.groups, authed: true };
    const appAdmin = isAppAdmin(user, app);
    return {
        user, target,
        level: u.level || 0, member: !u.anon && u.groups.length > 0,
        availLevel: u.availLevel || 0, inAvail: !!u.inAvail,
        authCan: (perm) => !u.anon && u.groups.length > 0 && !!scope.grants
            && (appAdmin || isUserAuthed({ user, reqPermissions: [perm], authPermissions: scope.grants })),
        manages: (group) => {
            if (!scope.grants) return false;
            const prot = group === `${app} Admin` || asList(scope.protectedGrants.groups[group]).some(p => PROTECTED_PERMISSIONS.includes(p));
            return !prot || appAdmin || holdsExplicitly({ user, reqPermissions: ['*'], authPermissions: scope.grants });
        },
        levelCovers: (group) => !u.anon && (linksByGroup[group] || []).every(l => (u.levels[l.project] ?? -1) >= l.level),
        source: (perms, { explicit = false } = {}) => {
            if (appAdmin) return true;
            const ap = mergeAuthPermissions(target.patternAP || {}, target.ap || {});
            return (explicit ? holdsExplicitly : isUserAuthed)({ user, reqPermissions: perms, authPermissions: ap });
        },
        legacySource: (perms) => !target.external || isUserAuthed({ user, reqPermissions: perms, authPermissions: target.ap || {} }),
        pattern: (perms) => appAdmin || isUserAuthed({ user, reqPermissions: perms, authPermissions: target.ap || {} }),
    };
}

function targetsFor(op, data) {
    switch (op.scope) {
        case 'auth': return [{ kind: 'auth', label: data.authRow ? `auth pattern ${data.authRow.id}` : 'auth (no auth pattern)' }];
        case 'platform': return [{ kind: 'platform', label: 'auth DB' }];
        case 'auth-group': return data.projectGroups.map(g => ({ kind: 'group', group: g.group, level: g.level, label: `group ${g.group} (L${g.level})` }));
        case 'pattern': return data.datasets.map(p => ({ kind: 'pattern', id: p.id, ap: p.ap, label: `datasets pattern ${p.id} ${p.name}` }));
        case 'source': return data.sources.map(s => ({ kind: 'source', ...s, label: `${s.external ? s.env : 'internal'} source ${s.id} ${s.name}` }));
        default: return [];
    }
}

// The cheapest grant that gives `u` the operation back on `target` (remediation proposal).
function proposeFix(op, target, u, data) {
    const perm = op.perm.split(/[|( ]/)[0];
    const holder = [...u.groups].sort((a, b) => (data.levelOf[b] || 0) - (data.levelOf[a] || 0))[0];
    const principal = holder ? { kind: 'group', name: holder } : { kind: 'user', name: String(u.id) };
    if (op.scope === 'platform') return { where: 'AVAIL membership', principal: { kind: 'user', name: u.email }, perm: 'join AVAIL' };
    if (op.scope === 'auth' || op.scope === 'auth-group') return { where: data.authRow ? `auth:${data.authRow.id}` : 'auth:?', principal, perm };
    if (op.scope === 'pattern') return { where: `pattern:${target.id}`, principal, perm };
    // a source: at pattern level when the source inherits, else on the source
    const own = Object.keys(normalize(target.ap).groups).length || Object.keys(normalize(target.ap).users).length;
    return { where: own ? `source:${target.env}/${target.id}` : `pattern-of:${target.env}/${target.id}`, principal, perm };
}

async function run(args) {
    if (!args.auth || !args.dms || !args.app) {
        console.error('usage: --auth <cfg> --dms <cfg> --app <app> [--project p] [--pgenv cfg[,cfg]] [--subdomain s] [--overlay f] [--out dir]');
        process.exit(2);
    }
    const app = args.app;
    const project = args.project || app;
    const subdomain = typeof args.subdomain === 'string' ? args.subdomain : '';
    const overlay = args.overlay ? JSON.parse(fs.readFileSync(args.overlay, 'utf8')) : {};

    const authA = openAdapter(args.auth);
    const dmsA = args.dms === args.auth ? authA : openAdapter(args.dms);
    const auth = await loadAuth(authA.db, project);
    const dms = await loadDms(dmsA.db, dmsA.config, app, subdomain);
    const usage = await loadUsage(dmsA.db, app);

    // External sources inherit the site's datasets patterns (the client names one; the union is the most a
    // client could claim, the same placeholder the server uses).
    const sitePatternAP = unionAuthPermissions(dms.datasets.map(p => p.ap));
    const external = [];
    for (const env of String(args.pgenv || '').split(',').filter(Boolean)) external.push(...await loadExternal(env, sitePatternAP));

    const ov = (key, ap) => applyOverlay(ap, overlay[key]);
    const authGrants = dms.authRow ? normalize(ov(`auth:${dms.authRow.id}`, resolveAuthPermissions(dms.authRow.data.authPermissions, subdomain))) : null;
    const scope = authGrants
        ? { grants: authGrants, protectedGrants: normalize(unionAuthPermissions([authGrants, ...dms.adminGrants])) }
        : { grants: null, protectedGrants: { groups: {}, users: {} } };
    const data = {
        authRow: dms.authRow,
        projectGroups: auth.projectGroups,
        levelOf: Object.fromEntries(auth.projectGroups.map(g => [g.group, g.level])),
        datasets: dms.datasets.map(p => ({ ...p, ap: ov(`pattern:${p.id}`, p.ap) })),
        sources: [...dms.internalSources, ...external].map(s => ({
            ...s,
            ap: ov(`source:${s.env}/${s.id}`, s.ap),
            patternAP: ov(`pattern-of:${s.env}/${s.id}`, s.patternAP),
        })),
    };

    const principals = [...auth.projectUsers, { anon: true, id: null, email: '(anonymous)', groups: [], level: 0, levels: {} }];
    const matrix = new Map();   // op|target → counts
    const losses = [], gains = [];

    for (const op of OPS) {
        for (const target of targetsFor(op, data)) {
            const key = `${op.key}\t${target.label}`;
            const cell = matrix.get(key) || { op: op.key, target: target.label, users: 0, old: 0, now: 0, final: 0, lostNow: 0, lostFinal: 0, intended: 0, holes: 0, gained: 0 };
            for (const u of principals) {
                if (op.scope === 'platform' && u.anon) continue;
                const c = makeContext({ u, app, scope, linksByGroup: auth.linksByGroup, target });
                const old = !!op.old(c), fin = !!op.final(c);
                const serverNow = !!op.now(c), uiNow = op.ui ? !!op.ui(c) : true;
                const now = serverNow && uiNow;
                cell.users++; cell.old += old; cell.now += now; cell.final += fin;
                if (old && (!now || !fin)) {
                    const reason = op.intended ? op.intended(c) : null;
                    const hole = !reason && op.hole ? op.hole(c) : null;
                    const key = usageKey(op, target);
                    const lastUse = key && u.id != null ? usage.get(`${u.id}|${key}`) || '' : '';
                    const row = {
                        op: op.key, task: op.task, target: target.label, user: u.email, user_id: u.id ?? '',
                        groups: u.groups.join('|'), level: u.level || 0,
                        lost_at: !serverNow ? 'now' : !uiNow ? 'now (UI hides it)' : 'final',
                        kind: reason ? 'intended' : hole ? 'hole' : 'unintended', why: reason || hole || '',
                        last_use: lastUse || (key ? 'none in change_log' : 'unknown'),
                        // a grant is proposed for real losses, and for holes someone used recently
                        fix: reason || (hole && !lastUse) ? null : proposeFix(op, target, u, data),
                    };
                    losses.push(row);
                    if (!now) cell.lostNow++; else cell.lostFinal++;
                    if (reason) cell.intended++;
                    if (hole) cell.holes++;
                } else if (!old && fin) {
                    gains.push({ op: op.key, target: target.label, user: u.email, groups: u.groups.join('|'), level: u.level || 0 });
                    cell.gained++;
                }
            }
            matrix.set(key, cell);
        }
    }

    // Remediation: unintended losses grouped into grants (group grants first; one grant fixes every member).
    const grants = {};
    const fixes = new Map();
    for (const l of losses.filter(l => l.fix)) {
        const f = l.fix;
        const k = `${f.where}\t${f.principal.kind}:${f.principal.name}\t${f.perm}`;
        const e = fixes.get(k) || { ...f, users: new Set(), ops: new Set(), lostNow: 0, holes: 0 };
        e.users.add(l.user); e.ops.add(l.op); if (l.lost_at.startsWith('now')) e.lostNow++; if (l.kind === 'hole') e.holes++;
        fixes.set(k, e);
        if (f.where !== 'AVAIL membership') {  // grants.json: what the grant migration (task 18) would write
            const slot = (grants[f.where] ||= { groups: {}, users: {} });
            const bucket = f.principal.kind === 'group' ? slot.groups : slot.users;
            bucket[f.principal.name] = [...new Set([...asList(bucket[f.principal.name]), f.perm])];
        }
    }

    const date = new Date().toISOString().slice(0, 10);
    const out = typeof args.out === 'string' ? args.out
        : path.resolve(__dirname, '../../../../../../scratchpad/permissions-access-diff', date, app + (args.overlay ? '-overlay' : ''));
    fs.mkdirSync(out, { recursive: true });
    const csv = (rows, cols) => [cols.join(','), ...rows.map(r => cols.map(c => {
        const v = r[c] == null ? '' : String(r[c]);
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(','))].join('\n') + '\n';

    fs.writeFileSync(path.join(out, 'matrix.csv'), csv([...matrix.values()],
        ['op', 'target', 'users', 'old', 'now', 'final', 'lostNow', 'lostFinal', 'intended', 'holes', 'gained']));
    fs.writeFileSync(path.join(out, 'losses.csv'), csv(losses,
        ['op', 'task', 'target', 'user', 'user_id', 'groups', 'level', 'lost_at', 'kind', 'why', 'last_use']));
    fs.writeFileSync(path.join(out, 'gains.csv'), csv(gains, ['op', 'target', 'user', 'groups', 'level']));
    fs.writeFileSync(path.join(out, 'grants.json'), JSON.stringify(grants, null, 2) + '\n');

    const unintended = losses.filter(l => l.kind === 'unintended');
    const holes = losses.filter(l => l.kind === 'hole');
    const md = [];
    md.push(`# Access diff: ${app} (project ${project}${subdomain ? `, subdomain ${subdomain}` : ''})`, '');
    md.push(`Run ${new Date().toISOString()}${args.overlay ? `, overlay ${args.overlay}` : ''}. ` +
        `${auth.projectUsers.length} users in ${auth.projectGroups.length} groups; auth pattern ${dms.authRow ? dms.authRow.id : 'none'}` +
        `${dms.authRows > 1 ? ` (${dms.authRows} auth patterns: first used)` : ''}` +
        `${authGrants ? (Object.keys(authGrants.groups).filter(g => g !== 'public').length || Object.keys(authGrants.users).length ? ', grants set' : ', open (no grants)') : ''}; ` +
        `${data.datasets.length} datasets patterns; ${dms.internalSources.length} internal and ${external.length} external sources.`, '');
    md.push(`| | users × targets |`, `|---|---|`,
        `| Lost on deploy (\`now\`), unintended | ${unintended.filter(l => l.lost_at === 'now').length} refused by the server, ` +
            `${unintended.filter(l => l.lost_at === 'now (UI hides it)').length} hidden by the client |`,
        `| Lost on deploy, holes / intended | ${losses.filter(l => l.kind !== 'unintended' && l.lost_at.startsWith('now')).length} |`,
        `| Lost at the end (\`final\`), unintended | ${unintended.filter(l => l.lost_at === 'final').length} |`,
        `| Holes closed (old rule let anyone in) | ${holes.length}, of which used recently: ${holes.filter(l => /^\d/.test(l.last_use)).length} |`,
        `| Lost, intended | ${losses.filter(l => l.kind === 'intended').length} |`,
        `| Gained | ${gains.length} |`, '');
    md.push('## Proposed grants', '', 'For real losses, and for holes someone used in the change_log window (marked in "From holes").', '');
    if (!fixes.size) md.push('None.', '');
    else {
        md.push('| Where | To | Permission | Users fixed | Lost on deploy | From holes | Operations |', '|---|---|---|---|---|---|---|');
        for (const f of [...fixes.values()].sort((a, b) => b.users.size - a.users.size)) {
            md.push(`| ${f.where} | ${f.principal.kind} ${f.principal.name} | ${f.perm} | ${f.users.size} | ${f.lostNow} | ${f.holes} | ${[...f.ops].join(', ')} |`);
        }
        md.push('');
    }
    md.push('## Holes closed, not used recently (no grant proposed)', '');
    const byHole = {};
    for (const l of holes.filter(l => !l.fix)) (byHole[`${l.op}: ${l.why}`] ||= new Set()).add(l.user);
    if (!Object.keys(byHole).length) md.push('None.', '');
    for (const [r, us] of Object.entries(byHole)) md.push(`- ${r} (${us.size} users)`);
    md.push('', '## Intended losses', '');
    const byReason = {};
    for (const l of losses.filter(l => l.kind === 'intended')) (byReason[`${l.op}: ${l.why}`] ||= new Set()).add(l.user);
    if (!Object.keys(byReason).length) md.push('None.', '');
    for (const [r, us] of Object.entries(byReason)) md.push(`- ${r} (${us.size} users)`);
    md.push('', '## Gains', '');
    const byGain = {};
    for (const g of gains) (byGain[g.op] ||= new Set()).add(g.user);
    if (!Object.keys(byGain).length) md.push('None.');
    for (const [op, us] of Object.entries(byGain)) md.push(`- ${op}: ${us.size} users`);
    fs.writeFileSync(path.join(out, 'remediation.md'), md.join('\n') + '\n');

    for (const a of new Set([authA, dmsA])) await a.db.end();
    console.log(md.slice(0, 10).join('\n'));
    console.log(`\nwrote ${out}`);
    return { out, losses, gains, matrix: [...matrix.values()], grants };
}

if (require.main === module) {
    run(parseArgs(process.argv.slice(2))).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run };
