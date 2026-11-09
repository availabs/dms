/**
 * UDA Task, Event, and Settings Falcor routes.
 * Auto-discovered by routes/index.js (filename matches *route*.js).
 */

const { atom: $atom, ref: $ref } = require("falcor-json-graph");
const {
  getTasksLength,
  getTaskIdsByIndex,
  getTaskById,
  getTasksForSourceLength,
  getTasksForSourceByIndex,
  getTaskEventsLength,
  getTaskEventsByIndex,
  getSettings,
  setSettings,
  softDeleteSource,
  hardDeleteSource,
} = require("./uda.tasks.controller");
const { getDb } = require("../../db");
const { readerAllowed } = require("../auth/requestUser");
const { assertCan } = require("../auth");

/**
 * Deletes drop tables (owner decision 2026-10-02), so they need a signed-in user, and
 * `delete-source` on every source the delete touches (a cascade reaches the sources of a run's
 * outputs). The decision follows DMS_AUTH_MODE (see sourceAuth.js): under `log`, DMS
 * internal sources (env `app+instance`) and sources the check can't read get the sign-in check only;
 * `enforce` checks them too.
 */
function deleteAuthorizer(env, router) {
  if (!router.user) throw new Error("Sign in to delete");
  return async (sourceIds) => {
    for (const sourceId of sourceIds) await assertCan(router, { env, source: sourceId, verb: 'delete-source' });
  };
}

// A refused or failed delete comes back as an error atom; DeleteRefused also carries its reason.
const deleteError = (err) => ({ error: err.message, ...(err.details ? { reason: err.details.reason, details: err.details } : {}) });

// Task and event reads need a signed-in user (readerAllowed, under DMS_AUTH_MODE); refused reads
// return nothing. Per-source view-source comes with read visibility (permissions-ds-read-visibility).
const TASK_ATTRS = [
  "task_id", "host_id", "source_id", "worker_path", "status", "progress",
  "result", "error", "descriptor", "queued_at", "started_at", "completed_at", "worker_pid"
];

const EVENT_ATTRS = [
  "event_id", "task_id", "type", "message", "payload", "created_at"
];

module.exports = [

  // --------------------------------- tasks.length ---------------------------------
  {
    route: `uda[{keys:envs}].tasks.length`,
    get: async function (pathSet) {
      try {
      if (!readerAllowed(this.user, "uda.tasks.length", this.requestApp || "")) return [];
        const { envs } = pathSet;
        const result = [];
        for (const env of envs) {
          const count = await getTasksLength(env);
          result.push({ path: ["uda", env, "tasks", "length"], value: +count });
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] tasks.length error:", err.message);
        return [];
      }
    },
  },

  // --------------------------------- tasks.byIndex ---------------------------------
  {
    route: `uda[{keys:envs}].tasks.byIndex[{integers:indices}]`,
    get: async function (pathSet) {
      try {
      if (!readerAllowed(this.user, "uda.tasks.byIndex", this.requestApp || "")) return [];
        const { envs, indices } = pathSet;
        const result = [];
        for (const env of envs) {
          const from = indices[0];
          const to = indices[indices.length - 1];
          const taskIds = await getTaskIdsByIndex(env, { from, to });
          for (let i = 0; i < taskIds.length; i++) {
            result.push({
              path: ["uda", env, "tasks", "byIndex", from + i],
              value: $ref(["uda", env, "tasks", "byId", taskIds[i]]),
            });
          }
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] tasks.byIndex error:", err.message);
        return [];
      }
    },
  },

  // --------------------------------- tasks.byId ---------------------------------
  {
    route: `uda[{keys:envs}].tasks.byId[{integers:taskIds}][{keys:attributes}]`,
    get: async function (pathSet) {
      try {
      if (!readerAllowed(this.user, "uda.tasks.byId", this.requestApp || "")) return [];
        const { envs, taskIds, attributes } = pathSet;
        const result = [];
        for (const env of envs) {
          for (const taskId of taskIds) {
            const row = await getTaskById(env, taskId, attributes);
            for (const attr of attributes) {
              const val = row ? row[attr] : undefined;
              result.push({
                path: ["uda", env, "tasks", "byId", taskId, attr],
                value: val !== undefined && val !== null && typeof val === 'object' ? $atom(val) : (val ?? null),
              });
            }
          }
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] tasks.byId error:", err.message);
        return [];
      }
    },
  },

  // --------------------------------- tasks.forSource.length ---------------------------------
  {
    route: `uda[{keys:envs}].tasks.forSource[{integers:sourceIds}].length`,
    get: async function (pathSet) {
      try {
      if (!readerAllowed(this.user, "uda.tasks.forSource.length", this.requestApp || "")) return [];
        const { envs, sourceIds } = pathSet;
        const result = [];
        for (const env of envs) {
          for (const sourceId of sourceIds) {
            const count = await getTasksForSourceLength(env, sourceId);
            result.push({
              path: ["uda", env, "tasks", "forSource", sourceId, "length"],
              value: +count,
            });
          }
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] tasks.forSource.length error:", err.message);
        return [];
      }
    },
  },

  // --------------------------------- tasks.forSource.byIndex ---------------------------------
  {
    route: `uda[{keys:envs}].tasks.forSource[{integers:sourceIds}].byIndex[{integers:indices}]`,
    get: async function (pathSet) {
      try {
      if (!readerAllowed(this.user, "uda.tasks.forSource.byIndex", this.requestApp || "")) return [];
        const { envs, sourceIds, indices } = pathSet;
        const result = [];
        for (const env of envs) {
          for (const sourceId of sourceIds) {
            const from = indices[0];
            const to = indices[indices.length - 1];
            const taskIds = await getTasksForSourceByIndex(env, sourceId, { from, to });
            for (let i = 0; i < taskIds.length; i++) {
              result.push({
                path: ["uda", env, "tasks", "forSource", sourceId, "byIndex", from + i],
                value: $ref(["uda", env, "tasks", "byId", taskIds[i]]),
              });
            }
          }
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] tasks.forSource.byIndex error:", err.message);
        return [];
      }
    },
  },

  // --------------------------------- tasks.byId.events.length ---------------------------------
  {
    route: `uda[{keys:envs}].tasks.byId[{integers:taskIds}].events.length`,
    get: async function (pathSet) {
      try {
      if (!readerAllowed(this.user, "uda.tasks.byId.events.length", this.requestApp || "")) return [];
        const { envs, taskIds } = pathSet;
        const result = [];
        for (const env of envs) {
          for (const taskId of taskIds) {
            const count = await getTaskEventsLength(env, taskId);
            result.push({
              path: ["uda", env, "tasks", "byId", taskId, "events", "length"],
              value: +count,
            });
          }
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] events.length error:", err.message);
        return [];
      }
    },
  },

  // --------------------------------- tasks.byId.events.byIndex ---------------------------------
  {
    route: `uda[{keys:envs}].tasks.byId[{integers:taskIds}].events.byIndex[{integers:indices}][{keys:attributes}]`,
    get: async function (pathSet) {
      try {
      if (!readerAllowed(this.user, "uda.tasks.byId.events.byIndex", this.requestApp || "")) return [];
        const { envs, taskIds, indices, attributes } = pathSet;
        const result = [];
        for (const env of envs) {
          for (const taskId of taskIds) {
            const from = indices[0];
            const to = indices[indices.length - 1];
            const rows = await getTaskEventsByIndex(env, taskId, { from, to }, attributes);
            for (let i = 0; i < rows.length; i++) {
              for (const attr of attributes) {
                const val = rows[i][attr];
                result.push({
                  path: ["uda", env, "tasks", "byId", taskId, "events", "byIndex", from + i, attr],
                  value: val !== undefined && val !== null && typeof val === 'object' ? $atom(val) : (val ?? null),
                });
              }
            }
          }
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] events.byIndex error:", err.message);
        return [];
      }
    },
  },

  // --------------------------------- settings ---------------------------------
  {
    route: `uda[{keys:envs}].settings`,
    get: async function (pathSet) {
      try {
        const { envs } = pathSet;
        const result = [];
        for (const env of envs) {
          const value = await getSettings(env);
          result.push({ path: ["uda", env, "settings"], value });
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] settings get error:", err.message);
        return [];
      }
    },
    // Needs `edit-pattern` on the datasets pattern that owns the env. A set can't name it, so this
    // logs a would-deny on every save (and denies under `enforce`); the client uses settings.update.
    set: async function (jsonGraph) {
      const result = [];
      const envs = Object.keys(jsonGraph.uda || {});
      for (const env of envs) {
        await assertCan(this, { env, verb: 'edit-pattern', pattern: null });
        const value = jsonGraph.uda[env].settings;
        await setSettings(env, value);
        result.push({ path: ["uda", env, "settings"], value });
      }
      return result;
    },
  },

  // --------------------------------- settings.update (call) ---------------------------------
  // Args: [env, value]. The settings set as a call: an edit of the env (`settings`), which the env
  // rule gives to its managers (`create-source` / `delete-source` on the env row or the site).
  {
    route: `uda.settings.update`,
    call: async function (callPath, args) {
      const [env, value] = args;
      await assertCan(this, { env, verb: 'edit', fields: ['settings'] });
      await setSettings(env, value);
      return [{ path: ["uda", env, "settings"], value }];
    },
  },

  // --------------------------------- sources.delete (call) ---------------------------------
  // Deletes the source, every view and its table, its files and tasks (see dama/delete.js).
  // Args: [env, sourceId, {cascade, pattern}?]. Returns a result atom on the sources.delete path.
  {
    route: `uda.sources.delete`,
    call: async function (callPath, args) {
      const [env, sourceId, opts = {}] = args;
      try {
        const authorize = deleteAuthorizer(env, this);
        const result = await softDeleteSource(env, sourceId, { cascade: !!opts?.cascade, authorize });
        return [
          { path: ["uda", env, "sources", "byId", sourceId], invalidated: true },
          { path: ["uda", env, "sources", "delete"], value: $atom(result) },
        ];
      } catch (err) {
        console.error("[uda.tasks] sources.delete error:", err.message);
        return [{ path: ["uda", env, "sources", "delete"], value: $atom(deleteError(err)) }];
      }
    },
  },

  // --------------------------------- sources.hardDelete (call) ---------------------------------
  // Alias of sources.delete for old clients: there is one delete and it drops tables.
  {
    route: `uda.sources.hardDelete`,
    call: async function (callPath, args) {
      const [env, sourceId, opts = {}] = args;
      try {
        const authorize = deleteAuthorizer(env, this);
        const result = await hardDeleteSource(env, sourceId, { cascade: !!opts?.cascade, authorize });
        return [
          { path: ["uda", env, "sources", "byId", sourceId], invalidated: true },
          { path: ["uda", env, "sources", "hardDelete"], value: $atom(result) },
        ];
      } catch (err) {
        console.error("[uda.tasks] sources.hardDelete error:", err.message);
        return [{ path: ["uda", env, "sources", "hardDelete"], value: $atom(deleteError(err)) }];
      }
    },
  },

  // --------------------------------- views.delete (call) ---------------------------------
  // Delete one DaMa view and drop its table. Refused while another view was built from it, while
  // it is authoritative, or while it is a run view with outputs (unless {cascade: true}).
  // Args: [env, viewId, {cascade, pattern}?]. Returns a result atom on the views.delete path.
  {
    route: `uda.views.delete`,
    call: async function (callPath, args) {
      const [env, viewId, opts = {}] = args;
      try {
        if (String(env).includes("+")) throw new Error("views.delete is for DaMa views; internal views are removed from the source");
        const authorize = deleteAuthorizer(env, this);
        const { deleteDamaView } = require("../../dama/delete");
        const result = await deleteDamaView(env, +viewId, { cascade: !!opts?.cascade, authorize });
        return [
          ...result.source_ids.map(id => ({ path: ["uda", env, "sources", "byId", id, "views"], invalidated: true })),
          ...result.deleted_views.map(id => ({ path: ["uda", env, "views", "byId", id], invalidated: true })),
          { path: ["uda", env, "views", "delete"], value: $atom(result) },
        ];
      } catch (err) {
        console.error("[uda.tasks] views.delete error:", err.message);
        return [{ path: ["uda", env, "views", "delete"], value: $atom(deleteError(err)) }];
      }
    },
  },
];
