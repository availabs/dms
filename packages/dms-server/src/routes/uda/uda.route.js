const { atom: $atom, ref: $ref } = require("falcor-json-graph");
const {
  getResponseColumnName,

  getSourcesLength,
  getSourceIdsByIndex,
  getSourceById,
  updateSource,
  setIndexColumn,
  setPrimaryKeyColumn,
  getSourcePrimaryKeyInfo,

  getViewLengthBySourceId,
  getViewsByIndexBySourceId,
  getViewById,
  updateView,
  getViewBySrcCategories,

  simpleFilterLength,
  simpleFilter,
  dataById,
  clearViewData,
  createExternalRow,
  updateExternalRow,
  deleteExternalRow
} = require("./uda.controller");
const { getEssentials } = require("./utils");
const { isUserAuthedForSource } = require("./sourceAuth");

// ================================================= UDA Source Routes =================================================

module.exports = [

  // --------------------------------- sources.length ---------------------------------
  {
    route: `uda[{keys:envs}].sources.length`,
    get: async function(pathSet) {
      try {
        const { envs } = pathSet;
        const result = [];

        for (const env of envs) {
          const numRows = await getSourcesLength(env);
          result.push({
            path: ["uda", env, "sources", "length"],
            value: +numRows,
          });
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },

  // --------------------------------- sources.byIndex ---------------------------------
  {
    route: `uda[{keys:envs}].sources.byIndex[{integers:indices}]`,
    get: async function(pathSet) {
      try {
        const { envs, indices } = pathSet;
        const result = [];

        for (const env of envs) {
          const idsByIdx = await getSourceIdsByIndex(env, { from: indices[0], to: indices[indices.length - 1] });

          indices.forEach((srcIdx, ii) => {
            const id = idsByIdx[ii];
            result.push({
              path: ["uda", env, "sources", "byIndex", srcIdx],
              value: $ref(["uda", env, "sources", "byId", id]),
            });
          });
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },

  // --------------------------------- sources.byId ---------------------------------
  {
    route: `uda[{keys:envs}].sources.byId[{integers:ids}][{keys:attributes}]`,
    get: async function(pathSet) {
      try {
        const { envs, ids, attributes } = pathSet;
        const result = [];

        for (const env of envs) {
          const rows = await getSourceById(env, ids, attributes);

          for (const id of ids) {
            const source = rows.find(r => +r.id === +id) || {};

            for (const attribute of attributes) {
              const value = source[attribute];
              result.push({
                path: ["uda", env, "sources", "byId", id, attribute],
                value: typeof value === 'object' ? $atom(value) : value,
              });
            }
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
    set: async function(jsonGraph) {
      try {
        const pgEnvs = Object.keys(jsonGraph.uda);
        const result = [];

        for (const pgEnv of pgEnvs) {
          const sourcesById = jsonGraph.uda[pgEnv].sources.byId;
          const ids = Object.keys(sourcesById);
          const { db } = await getEssentials({ env: pgEnv });

          for (const sourceId of ids) {
            // Per-source enforcement (pattern ⊕ source). Editing authPermissions itself needs
            // `edit-source-permissions`; other writes need `update-source`. Un-migrated envs (no
            // authPermissions column) are allowed (no prior enforcement to regress).
            const requiresPermEdit = JSON.stringify(sourcesById[sourceId] || {}).includes('auth_permissions');
            const reqPermissions = requiresPermEdit ? ['edit-source-permissions'] : ['update-source'];
            const authed = await isUserAuthedForSource({ db, sourceId: +sourceId, reqPermissions, user: this.user });
            if (!authed) {
              console.log("uda: UNAUTHORIZED source modify", sourceId, this.user && this.user.email);
              throw new Error(`User not authorized to modify source id(s): ${sourceId}`);
            }

            const rows = await updateSource(pgEnv, sourceId, sourcesById[sourceId]);
            const row = rows.find(r => +r.source_id === +sourceId || +r.id === +sourceId);

            if (!row) {
              result.push({
                path: ["uda", pgEnv, "sources", "byId", sourceId],
                value: $atom(null),
              });
            } else {
              for (const key in row) {
                result.push({
                  path: ["uda", pgEnv, "sources", "byId", sourceId, key],
                  value: typeof row[key] === "object" ? $atom(row[key]) : row[key],
                });
              }
            }
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },

  // --------------------------------- sources.byId.pkeyInfo ---------------------------------
  // Reports { hasPkey, pkeyColumn, isDetectedExisting } for a source's underlying table(s).
  {
    route: `uda[{keys:envs}].sources.byId[{integers:ids}].pkeyInfo`,
    get: async function(pathSet) {
      try {
        const { envs, ids } = pathSet;
        const result = [];

        for (const env of envs) {
          for (const id of ids) {
            const info = await getSourcePrimaryKeyInfo(env, id);
            result.push({
              path: ["uda", env, "sources", "byId", id, "pkeyInfo"],
              value: $atom(info),
            });
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },

  // --------------------------------- sources.byId.views.length ---------------------------------
  {
    route: `uda[{keys:envs}].sources.byId[{integers:ids}].views.length`,
    get: async function(pathSet) {
      try {
        const { envs, ids } = pathSet;
        const result = [];

        for (const env of envs) {
          const rows = await getViewLengthBySourceId(env, ids);

          for (const id of ids) {
            const length = rows.find(r => +r.id === +id)?.num_views || 0;
            result.push({
              path: ["uda", env, "sources", "byId", id, "views", "length"],
              value: length,
            });
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },

  // --------------------------------- sources.byId.views.byIndex ---------------------------------
  {
    route: `uda[{keys:envs}].sources.byId[{integers:ids}].views.byIndex[{integers:indices}]`,
    get: async function(pathSet) {
      try {
        const { envs, ids, indices } = pathSet;
        const result = [];

        for (const env of envs) {
          const rows = await getViewsByIndexBySourceId(env, ids, { from: indices[0], to: indices[indices.length - 1] });

          for (const id of ids) {
            const views = rows.find(r => +r.id === +id)?.views || [];
            indices.forEach((idx, ii) => {
              result.push({
                path: ["uda", env, "sources", "byId", id, "views", "byIndex", idx],
                value: $ref(["uda", env, "views", "byId", views?.[ii]]),
              });
            });
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },

  // ================================================= UDA View Routes ==================================================

  // --------------------------------- views.byId ---------------------------------
  {
    route: `uda[{keys:envs}].views.byId[{integers:ids}][{keys:attributes}]`,
    get: async function(pathSet) {
      try {
        const { envs, ids, attributes } = pathSet;
        const result = [];

        for (const env of envs) {
          const rows = await getViewById(env, ids, attributes);

          for (const id of ids) {
            const view = rows.find(r => +r.id === +id) || {};

            for (const attribute of attributes) {
              const value = view[attribute];
              result.push({
                path: ["uda", env, "views", "byId", id, attribute],
                value: typeof value === 'object' ? $atom(value) : value,
              });
            }
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
    set: async function(jsonGraph) {
      try {
        const pgEnvs = Object.keys(jsonGraph.uda);
        const result = [];

        for (const pgEnv of pgEnvs) {
          const viewsById = jsonGraph.uda[pgEnv].views.byId;
          const ids = Object.keys(viewsById);

          for (const viewId of ids) {
            const rows = await updateView(pgEnv, viewId, viewsById[viewId]);
            const row = rows.find(r => +r.view_id === +viewId || +r.id === +viewId);

            if (!row) {
              result.push({
                path: ["uda", pgEnv, "views", "byId", viewId],
                value: $atom(null),
              });
            } else {
              for (const key in row) {
                result.push({
                  path: ["uda", pgEnv, "views", "byId", viewId, key],
                  value: typeof row[key] === "object" ? $atom(row[key]) : row[key],
                });
              }
            }
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },
    // view.bySourceCategory
    // only for external sources
  {
    route: `uda[{keys:pgEnvs}].views.bySourceCategory[{keys:categories}]`,
    get: async function(pathSet) {
      try {
        const { pgEnvs, categories } = pathSet;
        const result = [];

        for (const pgEnv of pgEnvs) {
          for (const category of categories) {
            const rows = await getViewBySrcCategories(pgEnv, category);
            result.push({
              path: ["uda", pgEnv, "views", "bySourceCategory", category],
              value: $atom(rows),
            });
          }
        }

        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },
  // ============================================= UDA Data Query Routes =============================================

  // --------------------------------- options.length ---------------------------------
  {
    route: `uda[{keys:envs}].viewsById[{keys:viewIds}].options[{keys:options}].length`,
    get: async function(pathSet) {
      try {
        const { envs, viewIds, options } = pathSet;
        const result = [];

        for (const env of envs) {
          for (const viewId of viewIds) {
            for (const option of options) {
              const numRows = await simpleFilterLength(env, viewId, option);

              result.push({
                path: ["uda", env, "viewsById", viewId, "options", option, "length"],
                value: +numRows,
              });
            }
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },

  // --------------------------------- options.dataByIndex ---------------------------------
  {
    route: `uda[{keys:envs}].viewsById[{keys:viewIds}].options[{keys:options}].dataByIndex[{integers:indices}][{keys:attributes}]`,
    get: async function(pathSet) {
      try {
        const { envs, viewIds, options, indices, attributes } = pathSet;
        const result = [];

        for (const env of envs) {
          for (const viewId of viewIds) {
            for (const option of options) {
              const rows = await simpleFilter(env, viewId, option, attributes, { from: indices[0], to: indices[indices.length - 1] });

              indices.forEach((i, ii) => {
                attributes.forEach(attribute => {
                  const modifiedName = getResponseColumnName(attribute);
                  const value = rows?.[ii]?.[modifiedName];

                  result.push({
                    path: ["uda", env, "viewsById", viewId, "options", option, "dataByIndex", i, attribute],
                    value: typeof value === 'object' ? $atom(value) : value,
                  });
                });
              });
            }
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },

  // --------------------------------- options.byIndex (returns $ref to dataById) ---------------------------------
  {
    route: `uda[{keys:envs}].viewsById[{keys:viewIds}].options[{keys:options}].byIndex[{integers:indices}]`,
    get: async function(pathSet) {
      try {
        const { envs, viewIds, options, indices } = pathSet;
        const result = [];

        for (const env of envs) {
          for (const viewId of viewIds) {
            for (const option of options) {
              const rows = await simpleFilter(env, viewId, option, ['id'], { from: indices[0], to: indices[indices.length - 1] });

              indices.forEach((i, ii) => {
                const id = rows?.[ii]?.id;
                if (id) {
                  result.push({
                    path: ["uda", env, "viewsById", viewId, "options", option, "dataByIndex", i],
                    value: $ref(["uda", env, "viewsById", viewId, "dataById", id]),
                  });
                }
              });
            }
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },

  // --------------------------------- sources.setIndex (call) ---------------------------------
  // Args: [env, sourceId, columnName, enable]
  // Toggles isIndex on the named column. enable=true creates the DB index, enable=false drops it.
  {
    route: `uda.sources.setIndex`,
    call: async function(callPath, args) {
      try {
        const [env, sourceId, columnName, enable = true] = args;
        await setIndexColumn(env, sourceId, columnName, enable);
        return [
          { path: ["uda", env, "sources", "byId", +sourceId], invalidated: true },
        ];
      } catch (err) {
        console.error('[uda] sources.setIndex error:', err.message);
        throw err;
      }
    },
  },

  // --------------------------------- sources.setPrimaryKey (call) ---------------------------------
  // Args: [env, sourceId, columnName, enable]
  // External (DAMA) sources only. enable=true (default) validates the column (no NULLs, no
  // duplicates) across every physical table backing the source, then runs
  // ALTER TABLE ... ADD CONSTRAINT ... PRIMARY KEY. Throws (no partial DDL) if any table fails
  // validation. enable=false drops whatever the table's real PK constraint actually is and
  // clears isEditable (a source can't stay editable without a resolvable PK).
  {
    route: `uda.sources.setPrimaryKey`,
    call: async function(callPath, args) {
      try {
        const [env, sourceId, columnName, enable = true] = args;
        await setPrimaryKeyColumn(env, sourceId, columnName, enable);
        return [
          { path: ["uda", env, "sources", "byId", +sourceId], invalidated: true },
          { path: ["uda", env, "sources", "byId", +sourceId, "pkeyInfo"], invalidated: true },
        ];
      } catch (err) {
        console.error('[uda] sources.setPrimaryKey error:', err.message);
        throw err;
      }
    },
  },

  // --------------------------------- viewsById.clearData (call) ---------------------------------
  // Args: [env, view_id]
  // Truncates / deletes all rows in the split table for the given view.
  {
    route: 'uda.viewsById.clearData',
    call: async function(callPath, args) {
      try {
        const [env, view_id] = args;
        await clearViewData(env, +view_id);
        return [
          { path: ['uda', env, 'viewsById', +view_id], invalidated: true },
        ];
      } catch (err) {
        console.error('[uda] viewsById.clearData error:', err.message);
        throw err;
      }
    },
  },

  // --------------------------------- data.create (call) ---------------------------------
  // Args: [env, view_id, row]
  // External (DAMA) sources only. Re-validates metadata.isEditable + a resolvable real PK
  // server-side (uda.controller.js#resolveEditableTable) — the client's isEditable flag is a
  // UX convenience, not a trust boundary. Writes the row's attributes at the same dataById
  // path the GET route uses, so the response carries a real `id` (the DB-assigned/real PK
  // value) the client can read the same way dms.data.create's response does.
  {
    route: `uda.data.create`,
    call: async function(callPath, args) {
      try {
        if (!this.user) throw new Error('Authentication required to create rows');
        const [env, view_id, row] = args;
        const created = await createExternalRow(env, view_id, row);
        return Object.keys(created).map(attribute => ({
          path: ["uda", env, "viewsById", +view_id, "dataById", created.id, attribute],
          value: typeof created[attribute] === 'object' ? $atom(created[attribute]) : created[attribute],
        }));
      } catch (err) {
        console.error('[uda] data.create error:', err.message);
        throw err;
      }
    },
  },

  // --------------------------------- data.edit (call) ---------------------------------
  // Args: [env, view_id, id, row]
  {
    route: `uda.data.edit`,
    call: async function(callPath, args) {
      try {
        if (!this.user) throw new Error('Authentication required to edit rows');
        const [env, view_id, id, row] = args;
        const updated = await updateExternalRow(env, view_id, id, row);
        return Object.keys(updated).map(attribute => ({
          path: ["uda", env, "viewsById", +view_id, "dataById", updated.id, attribute],
          value: typeof updated[attribute] === 'object' ? $atom(updated[attribute]) : updated[attribute],
        }));
      } catch (err) {
        console.error('[uda] data.edit error:', err.message);
        throw err;
      }
    },
  },

  // --------------------------------- data.delete (call) ---------------------------------
  // Args: [env, view_id, id]
  {
    route: `uda.data.delete`,
    call: async function(callPath, args) {
      try {
        if (!this.user) throw new Error('Authentication required to delete rows');
        const [env, view_id, id] = args;
        await deleteExternalRow(env, view_id, id);
        return [
          { path: ["uda", env, "viewsById", +view_id, "dataById", id], invalidated: true },
        ];
      } catch (err) {
        console.error('[uda] data.delete error:', err.message);
        throw err;
      }
    },
  },

  // --------------------------------- dataById ---------------------------------
  {
    route: `uda[{keys:envs}].viewsById[{keys:viewIds}].dataById[{integers:ids}][{keys:attributes}]`,
    get: async function(pathSet) {
      try {
        const { envs, viewIds, ids, attributes } = pathSet;
        const result = [];

        for (const env of envs) {
          for (const viewId of viewIds) {
            const rows = await dataById(env, viewId, ids, attributes);

            ids.forEach((id) => {
              const row = rows.find(r => +r.id === +id);

              attributes.forEach(attribute => {
                const modifiedName = getResponseColumnName(attribute);
                const value = row?.[modifiedName] ?? null;

                result.push({
                  path: ["uda", env, "viewsById", viewId, "dataById", id, attribute],
                  value: typeof value === 'object' ? $atom(value) : value,
                });
              });
            });
          }
        }
        return result;
      } catch (err) {
        console.error(err);
        throw err;
      }
    },
  },
];
