const falcorJsonGraph = require("falcor-json-graph"),
  $atom = falcorJsonGraph.atom,
  $ref = falcorJsonGraph.ref,
  { createController, DATA_ATTRIBUTES } = require("./dms.controller.js"),
  FORMAT_ATTRIUBTES = ["app", "type", "attributes"];
const { isUserAuthed, resolveAuthPermissions } = require('./auth');
const { kindReadBlocked, PATTERN_READ_PERMISSIONS } = require('./kindReadAuth');
const { createGate, rowAuthMode } = require('./rowAuthGate');
const { getKind, getParent, isSplitType } = require('#db/type-utils.js');
// KIND auth (routes/dms/dataAuth.js) — left in place, not deleted. Put this line back and
// comment the next one out to move this surface back onto it.
// const { assertDataWrite, dataAuthMode } = require('./dataAuth');
const { assertDataWrite, dataAuthMode } = require('./rowAuthGate');

/*
 Controller Settings
*/
// Default routes using default controller
const controller = createController(process.env.DMS_DB_ENV || 'dms-sqlite')


/**
 * TASK 7 PHASE 3 — may this caller see the LISTING for `app+type`?
 *
 * Four Falcor routes answered this with five identical inline lines — `length`, `byIndex`,
 * `options[o].length`, `opts[o].byIndex`. One decision function now, same verdict.
 *
 * WHAT THIS QUESTION IS NOT. It is COARSE and pattern-level on purpose, and consolidating it does
 * not change that: it asks whether the caller may see the PATTERN, never whether they may read an
 * individual page. A caller who passes gets the full count and every ref INCLUDING pages they
 * cannot read — the per-row gate then refuses each and they receive `no-access` stubs. The content
 * is protected; the COUNT is not, in either direction. A refusal answers 0 even when some pages
 * were readable, and a pass answers the total even when most are not.
 *
 * Making `length` the AUTHORISED count is a behaviour change rather than a consolidation: it needs
 * per-row resolution across a whole listing to produce one number, and it changes what clients see
 * rather than who may see it. The hub files that under Phase B; it stays out of here so a
 * regression in one cannot be mistaken for the other.
 *
 * COUPLED TO `enforce`, exactly as the per-row branch is. The inline rule had no rollout mode — it
 * gated listings always — while the gate allows everything under `log`. Swapping unconditionally
 * would drop the listing gate for every deployment not already on `enforce`.
 */
async function listingBlocked(controller, { app, type, user, subdomain }) {
  if (getKind(type) !== 'page') return false;
  const parentKey = getParent(type);
  if (rowAuthMode() === 'enforce') {
    const patternRow = await controller.patternRowForPages(app, parentKey);
    // No content pattern → unrestricted, which is what a null from `getPatternAuthPermissions` has
    // always meant here.
    if (!patternRow) return false;
    const gate = createGate({ controller, app, user, subdomain });
    return !(await gate.judgeOne(patternRow, 'read')).allow;
  }
  const patternAuth = await controller.getPatternAuthPermissions(app, parentKey, subdomain);
  return !isUserAuthed({ user, reqPermissions: ['view-page'], authPermissions: patternAuth || {} });
}

/**
 * Create DMS Falcor routes with a specific controller
 * @param {Object} controller - DMS controller instance (from createController)
 * @returns {Array} Falcor route definitions
 */
function createRoutes(controller = createController(process.env.DMS_DB_ENV || 'dms-sqlite')) {
  /**
   * Build Falcor response entries for byId data.
   * When app is provided, uses the app-namespaced path: dms.data[app].byId[id][att]
   * Otherwise uses legacy path: dms.data.byId[id][att]
   */
  // user=undefined → skip auth check (CALL routes returning freshly written rows)
  // user=null     → unauthenticated GET request
  // user={...}    → authenticated GET request
  const dataByIdResponse = async (rows, ids, atts, app = null, user = undefined, subdomain = '') => {
    const response = [];
    // Cache pattern auth results within this response to avoid repeated DB lookups
    const patternAuthCache = new Map();
    // One row-auth gate per (app, user) within this response: the resolver memoises its container
    // map, so sharing it means the type-path lookup is loaded once rather than per row.
    const gateCache = new Map();
    const rowAuthGateFor = (a, u, sub) => {
      const k = `${a}:${(u && u.id) ?? 'anon'}:${sub}`;
      if (!gateCache.has(k)) gateCache.set(k, createGate({ controller, app: a, user: u, subdomain: sub }));
      return gateCache.get(k);
    };
    for (const id of ids) {
      const row = rows.reduce((a, c) => (c.id == id ? c : a), {});
      const idStr = String(id);

      if (user !== undefined && row.type) {
        const kind = getKind(row.type);
        let blocked = false;

        // TASK 7 PHASE 2 — the collapse, coupled to `enforce` on purpose (owner, 2026-10-29).
        //
        // Kind auth has NO rollout mode: it enforces pattern and page reads always. The gate is
        // staged, and under `log` — the default, so every deployment today — it allows everything
        // and merely reports. Deleting the kind branch outright would therefore stop enforcing
        // page reads everywhere that is not already on `enforce`, which is a security regression
        // and not a consolidation.
        //
        // So the branch is kept for exactly the deployments that still need it:
        //
        //   legacy / log   pattern + page → KIND auth, enforced, unchanged from today
        //   enforce        pattern + page → the gate, i.e. ONE decision path for every kind
        //
        // Proved equivalent before this landed: `--diff-reads` on a 33,967-row clone of production
        // reports, for pattern and page, **0 TIGHTER and 55 LOOSER** — the 55 being `${app} Admin`
        // gaining reads the route's page branch never granted, which `verdict` grants by design.
        // Nobody loses read access. The remaining divergence it prints is on `component`, a kind
        // that already goes through the gate and is therefore not affected by this line.
        //
        // The branch and `./kindReadAuth.js` go when every target runs `enforce` — task 8's
        // cutover for production. Until then this is the coupling, stated rather than hidden.
        if ((kind === 'pattern' || kind === 'page') && rowAuthMode() !== 'enforce') {
          blocked = await kindReadBlocked({
            row, kind, user, subdomain, app,
            patternAuthOf: async (a, parentKey) => {
              const cacheKey = `${a}:${parentKey}`;
              if (!patternAuthCache.has(cacheKey)) {
                patternAuthCache.set(cacheKey, await controller.getPatternAuthPermissions(a, parentKey, subdomain));
              }
              return patternAuthCache.get(cacheKey);
            },
          });
        } else if (rowAuthMode() !== 'legacy') {
          // EVERY OTHER KIND. Until now nothing gated these at all — site, theme, tenant, dmsenv,
          // source, view, component, page-edit and split `:data` are guarded on WRITE (dataAuth.js)
          // and were open on READ, because `judge()` is write-only and this gate knows two kinds.
          //
          // Added as a separate branch on purpose: `pattern` and `page` keep their existing logic
          // untouched, which also preserves the exemptions above — auth and admin pattern rows stay
          // publicly readable so a logged-out visitor can load the login page and build routes.
          //
          // Under DMS_ROW_AUTH_MODE=log (the default) this only writes `would-deny` lines; it
          // decides nothing until a server is flipped to `enforce`. Errors fall back to today's
          // behaviour: a resolver fault must not take the read path down, and in `log` the verdict
          // was never going to be used anyway.
          try {
            const appForLookup = app || row.app;
            if (appForLookup) {
              const gate = rowAuthGateFor(appForLookup, user, subdomain);
              const v = await gate.judgeOne(row, 'read');
              blocked = !v.allow;
            }
          } catch (e) {
            console.warn(`[row-auth] read gate failed for ${row.type} ${idStr}: ${e.message} — allowing`);
          }
        }

        if (blocked) {
          for (const att of atts) {
            const path = app
              ? ["dms", "data", app, "byId", idStr, att]
              : ["dms", "data", "byId", idStr, att];
            let value;
            if (att === 'app') value = row.app || app || null;
            else if (att === 'type') value = row.type || null;
            else if (kind === 'pattern' && att === 'data') {
              // Return minimal routing info so the client builds the route and
              // redirects to login instead of 404ing. `theme` must be included:
              // without it a transient auth failure renders the whole site with
              // the default theme (and the login redirect unbranded). `config`
              // stays out — schema info, not needed for routing/branding.
              //
              // `locations` and `retired_subdomains` are routing info too, and
              // omitting them broke the very thing this stub exists for:
              // getPatternMounts() / buildRetiredSubdomainMap()
              // (render/spa/utils/index.js) read them to resolve every non-primary
              // mount, so a pattern served at a `locations` mount registered NO
              // route for a logged-out visitor. `/tsmo` then fell through to
              // whatever catch-all sat at `/` and rendered THAT page instead of the
              // login screen — the auth gate lives inside
              // patterns/page/pages/view.jsx, so a route that never registers can
              // never redirect. Exposes nothing sensitive: mount points are the
              // same class of public routing data as `subdomain`/`base_url` above.
              value = $atom({
                id: 'no-access',
                base_url: row.data?.base_url,
                pattern_type: row.data?.pattern_type,
                subdomain: row.data?.subdomain,
                locations: row.data?.locations,
                retired_subdomains: row.data?.retired_subdomains,
                authPermissions: row.data?.authPermissions,
                name: row.data?.name,
                theme: row.data?.theme,
                // A pattern's `public` settings: what its type chooses to show everyone, whether or not
                // they're granted on the row (e.g. where a nav widget files reports). Whatever the row
                // holds there is readable by anyone who can load the site, signed out included; the
                // type writes it from its own settings and keeps everything else out.
                public: row.data?.public,
              });
            } else value = 'no-access';
            response.push({ path, value });
          }
          continue;
        }
      }

      for (const att of atts) {
        let getAtt = att;
        if(getAtt.includes('data ->> ')){
          getAtt = att.split('->>')[1].trim().replace(/[']/g, '')
        }
        let value = row[getAtt] ?? null;
        // Normalize id to string for consistent type across backends
        if (att === 'id' && value != null) value = String(value);
        const path = app
          ? ["dms", "data", app, "byId", idStr, att]
          : ["dms", "data", "byId", idStr, att];
        response.push({
          path,
          value: att === "data" ? $atom(value) : value,
        });
      }
    }
    return response;
  };

  // The rows a write touches, as stored, for assertDataWrite: a split type resolves its own table
  // (every row in it is that type); anything else is read from the app's main table, never trusting
  // the type the client names.
  const storedRows = async (app, ids, type) => {
    if (type && isSplitType(type)) return ids.map(id => ({ id, type, data: null }));
    const rows = await controller.getRowsForWrite(ids, app);
    return ids.map(id => rows.find(r => String(r.id) === String(id)) || { id, type: '', data: null, missing: true });
  };

  // Read → judge → write, with the write checking (in its transaction) that the row is still what was
  // judged; when it changed in between, read and judge again (3 tries). `write(stored, expect)`.
  // Split rows are never compared (their edit doesn't depend on the stored data). `legacy` checks
  // nothing, as before.
  const judgedWrite = async (app, id, type, write) => {
    for (let attempt = 0; ; attempt++) {
      const [stored] = await storedRows(app, [id], type);
      const expect = dataAuthMode() === 'legacy' || (type && isSplitType(type)) ? null
        : stored.missing ? { missing: true } : { type: stored.type, dataText: stored.data_text };
      try {
        return await write(stored, expect);
      } catch (e) {
        if (e.code !== 'DMS_STALE_ROW' || attempt >= 2) throw e;
      }
    }
  };

  return [
    {
      route: "dms.format[{keys:appKeys}]['app','type','attributes']",
      get: function(pathSet) {
        const [, , keys] = pathSet;
        return controller.getFormat(keys).then((rows) => {
          const response = [];
          keys.forEach((key) => {
            const [app, type] = key.split("+"),
              row = rows.reduce(
                (a, c) => (c.app == app && c.type === type ? c : a),
                {}
              );
            FORMAT_ATTRIUBTES.forEach((att) => {
              const value = row[att] ?? null;
              response.push({
                path: ["dms", "format", key, att],
                value: att === "attributes" ? $atom(value) : value,
              });
            });
          });
          return response;
        });
      },
    },
    {
      route: "dms.data[{keys:appKeys}].length",
      get: async function(pathSet) {
        const [, , keys] = pathSet;
        const user = this.user;
        const subdomain = this.subdomain;
        const rows = await controller.dataLength(keys);
        const response = [];
        for (const key of keys) {
          const [app, type] = key.split('+');
          if (await listingBlocked(controller, { app, type, user, subdomain })) {
            response.push({ path: ["dms", "data", key, "length"], value: 0 });
            continue;
          }
          response.push({
            path: ["dms", "data", key, "length"],
            value: rows.reduce((a, c) => (c.key === key ? c.length : a), 0),
          });
        }
        return response;
      },
    },
    {
      // The source a dataset name routes to in an app (controller.getSourceIdBySlug), or null.
      route: "dms.sourceIdBySlug[{keys:apps}][{keys:slugs}]",
      get: async function(pathSet) {
        const [, , apps, slugs] = pathSet;
        const response = [];
        for (const app of apps) {
          for (const slug of slugs) {
            const id = await controller.getSourceIdBySlug(app, slug);
            response.push({ path: ["dms", "sourceIdBySlug", app, slug], value: id ? +id : null });
          }
        }
        return response;
      },
    },
    {
      route: "dms.data[{keys:appKeys}].searchOne[{keys:searchkeys}]",
      get: function(pathSet) {
        const [, , keys,,searchkeys] = pathSet;
        return controller.dataSearch(keys,searchkeys)
          .then((rows) => {
            const response = []
            keys.map((key) => {
              const [app] = key.split('+');
              searchkeys.map((searchkey) => {
                const [{rows:[id = null]}] = rows.filter(d => d.key === `${key}|${searchkey}`)
                response.push({
                  path: ["dms", "data", key, "searchOne", searchkey],
                  value:  id ? $ref(["dms", "data", app, "byId", String(id)]) : null
                })
              })
            });
            return response
          });
      },
    },
    {
      route: "dms.data[{keys:appKeys}].byIndex[{integers:indices}]",
      get: async function(pathSet) {
        const [, , keys, , indices] = pathSet;
        const user = this.user;
        const subdomain = this.subdomain;
        const rows = await controller.dataByIndex(keys, indices);
        const response = [];
        for (const key of keys) {
          const [app, type] = key.split('+');
          if (await listingBlocked(controller, { app, type, user, subdomain })) {
            indices.forEach((i) => {
              response.push({ path: ["dms", "data", key, "byIndex", i], value: null });
            });
            continue;
          }
          const reduced = rows.reduce((a, c) => (c.key == key ? c.rows : a), []);
          indices.forEach((i) => {
            const id = reduced.reduce((a, c) => (c.i == i ? c.id : a), null);
            response.push({
              path: ["dms", "data", key, "byIndex", i],
              value: id ? $ref(["dms", "data", app, "byId", String(id)]) : null,
            });
          });
        }
        return response;
      },
    },
    {
      route: "dms.data[{keys:appKeys}].options[{keys:options}].length",
      get: async function(pathSet) {
        const [, , keys, , options] = pathSet;
        const user = this.user;
        const subdomain = this.subdomain;
        const response = [];

        for (const option of options) {
          const rows = await controller.filteredDataLength(keys, option);
          for (const key of keys) {
            const [app, type] = key.split('+');
            if (await listingBlocked(controller, { app, type, user, subdomain })) {
              response.push({ path: ["dms", "data", key, "options", option, "length"], value: 0 });
              continue;
            }
            const reduced = rows.reduce((a, c) => (c.key === key ? c.length : a), 0);
            response.push({
              path: ["dms", "data", key, "options", option, "length"],
              value: reduced || 0,
            });
          }
        }

        return response;
      },
    },
    {
      route: "dms.data[{keys:appKeys}].opts[{keys:options}].byIndex[{integers:indices}]",
      get: async function(pathSet) {
        try{
          const [, , keys, , options, , indices ] = pathSet;
          const user = this.user;
          const subdomain = this.subdomain;
          const response = [];

          for (const option of options) {
            const rows = await controller.filteredDataByIndex(keys, indices, option, ['id']);

            for (const key of keys) {
              const [app, type] = key.split('+');
              if (await listingBlocked(controller, { app, type, user, subdomain })) {
                indices.forEach((i) => {
                  response.push({ path: ["dms", "data", key, 'opts', option, "byIndex", i], value: null });
                });
                continue;
              }
              const reduced = rows.reduce((a, c) => (c.key == key ? c.rows : a), []);
              indices.forEach((i) => {
                const row = reduced.find(c => c.i == i) || {};
                response.push({
                  path: ["dms", "data", key, 'opts', option, "byIndex", i],
                  value: row?.id ? $ref(["dms", "data", app, "byId", String(row.id)]) : null,
                });
              });
            }
          }

          return response;
        } catch (err) {
          console.error(err);
          throw err;
        }
      },
    },
    {
      route: "dms.search[{keys:appKeys}][{keys:types}]",
      get: async function(pathSet) {
        try{
          const [, , keys, types] = pathSet;
          const response = [];

          for(const type of types){
            const rows = await controller.getTags(keys, type)

            keys.forEach((key) => {
              const reduced = rows.reduce(
                  (a, c) => (c.key == key ? c.rows : a),
                  []
              );

              response.push({
                path: ["dms", "search", key, type],
                value: $atom(reduced || [])
              });

            });
          }

          return response;
        } catch (err) {
          console.error(err);
          throw err;
        }
      },
    },
    {
      route: "dms.search[{keys:appKeys}][{keys:searchTypes}][{keys:tags}]",
      get: async function(pathSet) {
        try{
          const [, , keys, searchTypes, tags] = pathSet;
          const response = [];
          for(const searchType of searchTypes){
            for(const tag of tags){
              const rows = await controller.searchByTag(keys, tag, searchType)

              keys.forEach((key) => {
                const reduced = rows.reduce(
                    (a, c) => (c.key == key ? c.rows : a),
                    []
                );

                response.push({
                  path: ["dms", "search", key, searchType, tag],
                  value: $atom(reduced || [])
                });

              });
            }
          }

          return response;
        } catch (err) {
          console.error(err);
          throw err;
        }
      },
    },
    {
      route: "dms.data[{keys:appKeys}].sections",
      get: async function(pathSet) {
        try{
          const [, , keys] = pathSet;
          const response = [];

          const rows = await controller.getSections(keys);

          keys.forEach((key) => {
            const reduced = rows.reduce(
                (a, c) => (c.key == key ? c.rows : a),
                []
            );

            response.push({
              path: ["dms", "data", key, "sections"],
              value: $atom(reduced || [])
            });

          });

          return response;
        } catch (err) {
          console.error(err);
          throw err;
        }
      },
    },
    {
      // Legacy byId route — queries data_items (no app context)
      route: `dms.data.byId[{keys:ids}][{keys:attributes}]`,
      get: async function(pathSet) {
        const [, , , ids, atts] = pathSet;
        const user = this.user;
        const subdomain = this.subdomain;
        // The auth check keys off row.type — always fetch it. A `data`-only
        // request otherwise skips the check and leaks restricted rows.
        const fetchAtts = atts.includes('type') ? atts : [...atts, 'type'];
        const rows = await controller.getDataById(ids, fetchAtts);
        return await dataByIdResponse(rows, ids, atts, null, user, subdomain);
      },
    },
    {
      // App-namespaced byId route — resolves per-app table when in per-app mode
      route: `dms.data[{keys:apps}].byId[{keys:ids}][{keys:attributes}]`,
      get: async function(pathSet) {
        const [, , apps, , ids, atts] = pathSet;
        const user = this.user;
        const subdomain = this.subdomain;
        // The auth check keys off row.type — always fetch it. A `data`-only
        // request otherwise skips the check and leaks restricted rows.
        const fetchAtts = atts.includes('type') ? atts : [...atts, 'type'];
        const results = await Promise.all(
          apps.map(app =>
            controller.getDataById(ids.filter(i => i !== 'no-access'), fetchAtts, app)
              .then(rows => dataByIdResponse(rows, ids.filter(i => i !== 'no-access'), atts, app, user, subdomain))
          )
        );
        return [].concat(...results);
      },
    },
    {
      route: "dms.data.edit",
      call: async function(callPath, args) {
        if (args.length >= 3) {
          // New format: [app, id, data] or [app, id, data, type]
          // When type is provided, the controller resolves the split table for dataset rows.
          const [app, id, data, type] = args;
          const rows = await judgedWrite(app, id, type, async (stored, expect) => {
            // only what the guard judged is written (dataAuth.js planEdit)
            const toWrite = await assertDataWrite(this, controller, 'edit', app, stored, data);
            return controller.setDataById(id, toWrite, this.user, app, type || null, this.reqMeta, { changeHistory: true, expect });
          });
          return await dataByIdResponse(rows, [id], DATA_ATTRIBUTES, app);
        }
        // Legacy format: [id, data]
        const [id, data] = args;
        const rows = await judgedWrite(null, id, null, async (stored, expect) => {
          const toWrite = await assertDataWrite(this, controller, 'edit', stored.app, stored, data);
          return controller.setDataById(id, toWrite, this.user, null, null, this.reqMeta, { expect });
        });
        return await dataByIdResponse(rows, [id], DATA_ATTRIBUTES);
      },
    },
    {
      route: "dms.data.massedit",
      call: async function(callPath, args) {
        // the 5th argument (a user id) is ignored: updated_by is the token's user
        const [app, type, column, maps] = args;
        console.log('massedit', app, type, column, JSON.stringify(maps, null, 3))
        // every row of `type`: judged as one edit of that type
        await assertDataWrite(this, controller, 'edit', app, { id: null, type, data: null }, { [column]: null });
        return controller.setMassData(app, type, column, maps, this.user?.id ?? null).then((rows) => {
          return [{
            path: ['dms', 'data', 'massedit'],
            value: $atom(rows)
          }]
        });
      },
    },
    {
      route: "dms.type.edit",
      call: async function(callPath, args) {
        if (args.length >= 3) {
          // New format: [app, id, type]
          const [app, id, type] = args;
          const rows = await judgedWrite(app, id, null, async (stored, expect) => {
            // a move: out of the old type (as a delete), into the new one (as a create)
            await assertDataWrite(this, controller, 'delete', app, stored, null);
            await assertDataWrite(this, controller, 'create', app, { id, type, data: stored.data }, null);
            return controller.setTypeById(id, type, this.user, app, this.reqMeta, { expect });
          });
          return await dataByIdResponse(rows, [id], DATA_ATTRIBUTES, app);
        }
        // Legacy format: [id, type]
        const [id, type] = args;
        const rows = await judgedWrite(null, id, null, async (stored, expect) => {
          // a move: out of the old type (as a delete), into the new one (as a create)
          await assertDataWrite(this, controller, 'delete', stored.app, stored, null);
          await assertDataWrite(this, controller, 'create', stored.app, { id, type, data: stored.data }, null);
          return controller.setTypeById(id, type, this.user, null, this.reqMeta, { expect });
        });
        return await dataByIdResponse(rows, [id], DATA_ATTRIBUTES);
      },
    },
    {
      route: "dms.data.create",
      call: async function(callPath, args) {
        const [app, type, data] = args;
        await assertDataWrite(this, controller, 'create', app, { id: null, type, data: data || {} }, null);
        const t0 = Date.now();
        console.log('[dms.data.create] START app=%s type=%s user=%s t=%d', app, type, this.user?.id || 'anon', t0);
        try {
          const rows = await controller.createData(args, this.user, this.reqMeta, { changeHistory: true });
          console.log('[dms.data.create] OK rows=%d id=%s elapsed=%dms', rows.length, rows[0]?.id, Date.now() - t0);
          const ids = rows.map(({ id }) => String(id));
          return [
            // Return at both paths so old and new clients can find the data
            ...await dataByIdResponse(rows, ids, DATA_ATTRIBUTES),
            ...await dataByIdResponse(rows, ids, DATA_ATTRIBUTES, app),
            { path: ["dms", "data", `${app}+${type}`], invalidated: true },
          ];
        } catch (e) {
          console.error('[dms.data.create] ERROR:', e);
          throw e;
        }
      },
    },
    {
      route: "dms.data.delete",
      call: async function(callPath, args) {
        if (!this.user) {
          throw new Error('Authentication required to delete items');
        }
        const [app, type, ...ids] = args;
        for (const row of await storedRows(app, ids, type)) {
          await assertDataWrite(this, controller, 'delete', app, row, null);
        }
        return controller.deleteData(app, type, ids, this.user, this.reqMeta).then((rows) => [
          // Invalidate both old and new paths
          ...ids.flatMap((id) => ([
            { path: ["dms", "data", "byId", id], invalidated: true },
            { path: ["dms", "data", app, "byId", id], invalidated: true },
          ])),
          { path: ["dms", "data", `${app}+${type}`], invalidated: true },
        ]);
      },
    },
  ];
}


module.exports = createRoutes(controller);
module.exports.createRoutes = createRoutes;
// The controller instance every Falcor route is actually served from. It is NOT the module
// default export of dms.controller.js — that one is a separate instance created at import
// time and never serves a request. `index.js` wires the sync WebSocket's notifyChange onto
// THIS object; setting it on the default instance leaves `_notifyChange` null here, so every
// Falcor write appends its change_log row and broadcasts nothing (found 2026-09-25 testing
// Bug 20, fixed 2026-10-21 — falcor-writes-not-broadcast.md).
module.exports.controller = controller;
