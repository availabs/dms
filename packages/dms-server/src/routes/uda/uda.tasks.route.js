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
  updateSourceMetadata,
} = require("./uda.tasks.controller");

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
    set: async function (jsonGraph) {
      try {
        const result = [];
        const envs = Object.keys(jsonGraph.uda || {});
        for (const env of envs) {
          const value = jsonGraph.uda[env].settings;
          await setSettings(env, value);
          result.push({ path: ["uda", env, "settings"], value });
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] settings set error:", err.message);
        return [];
      }
    },
  },

  // --------------------------------- sources.update (call) ---------------------------------
  {
    route: `uda.sources.update`,
    call: async function (callPath, args) {
      try {
        const [env, sourceId, updates] = args;
        const row = await updateSourceMetadata(env, sourceId, updates);
        if (!row) return [];

        const result = [];
        for (const attr of Object.keys(row)) {
          const val = row[attr];
          result.push({
            path: ["uda", env, "sources", "byId", row.source_id, attr],
            value: val !== undefined && val !== null && typeof val === 'object' ? $atom(val) : (val ?? null),
          });
        }
        return result;
      } catch (err) {
        console.error("[uda.tasks] sources.update error:", err.message);
        return [];
      }
    },
  },
];
