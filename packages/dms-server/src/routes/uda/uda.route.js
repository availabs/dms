const { atom: $atom, ref: $ref } = require("falcor-json-graph");
const {
  getResponseColumnName,

  getSourcesLength,
  getSourceIdsByIndex,
  getSourceById,
  updateSource,

  getViewLengthBySourceId,
  getViewsByIndexBySourceId,
  getViewById,
  updateView,

  simpleFilterLength,
  simpleFilter,
  dataById
} = require("./uda.controller");

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

          for (const sourceId of ids) {
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
