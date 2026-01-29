const falcorJsonGraph = require("falcor-json-graph"),
  $atom = falcorJsonGraph.atom,
  $ref = falcorJsonGraph.ref,
  { createController, DATA_ATTRIBUTES } = require("./dms.controller.js"),
  FORMAT_ATTRIUBTES = ["app", "type", "attributes"];

/*
 Controller Settings
*/
// Default routes using default controller (backward compatible)
const dbOptions = ['dms-sqlite', 'dms-postgres']
const controller = createController(dbOptions[1])


/**
 * Create DMS Falcor routes with a specific controller
 * @param {Object} controller - DMS controller instance (from createController)
 * @returns {Array} Falcor route definitions
 */
function createRoutes(controller = createController('dms-sqlite')) {
  const dataByIdResponse = (rows, ids, atts) => {
    const response = [];
    ids.forEach((id) => {
      const row = rows.reduce((a, c) => (c.id == id ? c : a), {});

      atts.forEach((att) => {
        let getAtt = att;
        if(getAtt.includes('data ->> ')){
          getAtt = att.split('->>')[1].trim().replace(/[']/g, '')
        }
        const value = row[getAtt] ?? null;
        response.push({
          path: ["dms", "data", "byId", id, att],
          value: att === "data" ? $atom(value) : value,
        });
      });
    });
    return response;
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
      get: function(pathSet) {
        const [, , keys] = pathSet;
        return controller.dataLength(keys).then((rows) => {
          return keys.map((key) => ({
            path: ["dms", "data", key, "length"],
            value: rows.reduce((a, c) => (c.key === key ? c.length : a), 0),
          }));
        });
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
              searchkeys.map((searchkey) => {
                const [{rows:[id = null]}] = rows.filter(d => d.key === `${key}|${searchkey}`)
                response.push({
                  path: ["dms", "data", key, "searchOne", searchkey],
                  value:  id ? $ref(["dms", "data", "byId", +id]) : null
                })
              })
            });
            return response
          });
      },
    },
    {
      route: "dms.data[{keys:appKeys}].byIndex[{integers:indices}]",
      get: function(pathSet) {
        const [, , keys, , indices] = pathSet;
        return controller.dataByIndex(keys, indices).then((rows) => {
          const response = [];
          keys.forEach((key) => {
            const reduced = rows.reduce(
              (a, c) => (c.key == key ? c.rows : a),
              []
            );
            indices.forEach((i) => {
              const id = reduced.reduce((a, c) => (c.i == i ? c.id : a), null);
              response.push({
                path: ["dms", "data", key, "byIndex", i],
                value: id ? $ref(["dms", "data", "byId", id]) : null,
              });
            });
          });
          return response;
        });
      },
    },
    {
      route: "dms.data[{keys:appKeys}].options[{keys:options}].length",
      get: async function(pathSet) {
        const [, , keys, , options] = pathSet;
        const response = [];

        for(const option of options){
          const rows = await controller.filteredDataLength(keys, option);
          keys.forEach(key => {
            const reduced = rows.reduce((a, c) => (c.key === key ? c.length : a), 0);
            response.push({
              path: ["dms", "data", key, "options", option, "length"],
              value: reduced || 0,
            })
          })

        }

        return response;
      },
    },
    {
      route: "dms.data[{keys:appKeys}].options[{keys:options}].byIndex[{integers:indices}][{keys:attributes}]",
      get: async function(pathSet) {
        try{
          const [, , keys, , options, , indices, attributes] = pathSet;
          const response = [];

          for(const option of options){
            const rows = await controller.filteredDataByIndex(keys, indices, option, attributes)

            keys.forEach((key) => {
              const reduced = rows.reduce(
                  (a, c) => (c.key == key ? c.rows : a),
                  []
              );
              indices.forEach((i) => {
                const row = reduced.find(c => c.i == i);
                attributes.forEach(attribute => {
                  const modifiedName =
                      attribute.includes(' as ') ? attribute.split(' as ')[1]?.trim() :
                          attribute.includes(' AS ') ? attribute.split(' AS ')[1]?.trim() :
                              attribute;
                  response.push({
                    path: ["dms", "data", key, 'options', option, "byIndex", i, attribute],
                    value: typeof row?.[modifiedName] === 'object' ? $atom(row?.[modifiedName]) : row?.[modifiedName]
                  });
                })
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
      route: "dms.data[{keys:appKeys}].opts[{keys:options}].byIndex[{integers:indices}]",
      get: async function(pathSet) {
        try{
          const [, , keys, , options, , indices ] = pathSet;
          const response = [];

          for(const option of options){
            const rows = await controller.filteredDataByIndex(keys, indices, option, ['id'])

            keys.forEach((key) => {
              const reduced = rows.reduce(
                  (a, c) => (c.key == key ? c.rows : a),
                  []
              );
              indices.forEach((i) => {
                const row = reduced.find(c => c.i == i) || {};
                response.push({
                    path: ["dms", "data", key, 'opts', option, "byIndex", i],
                    value: row?.id ? $ref(["dms", "data", "byId", +row?.id]) : null,
                });
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
      route: `dms.data.byId[{keys:ids}][{keys:attributes}]`,
      get: function(pathSet) {
        const [, , , ids, atts] = pathSet;

        return controller
          .getDataById(ids,atts)
          .then((rows) => {
             return dataByIdResponse(rows, ids, atts)
          });
      },
    },
    {
      route: "dms.data.edit",
      call: function(callPath, args) {
        const [id, data] = args;
        return controller.setDataById(id, data, this.user).then((rows) => {
          return [
            ...dataByIdResponse(rows, [id], DATA_ATTRIBUTES),
          ];
        });
      },
    },
    {
      route: "dms.data.massedit",
      call: function(callPath, args) {
        const [app, type, column, maps, user] = args;
        console.log('massedit', app, type, column, JSON.stringify(maps, null, 3))
        return controller.setMassData(app, type, column, maps, user).then((rows) => {
          return [{
            path: ['dms', 'data', 'massedit'],
            value: $atom(rows)
          }]
        });
      },
    },
    {
      route: "dms.type.edit",
      call: function(callPath, args) {
        const [id, type] = args;
        return controller.setTypeById(id, type, this.user).then((rows) => {
          return [
            ...dataByIdResponse(rows, [id], DATA_ATTRIBUTES),
          ];
        });
      },
    },
    {
      route: "dms.data.create",
      call: function(callPath, args) {
        const [app, type] = args;
        return controller.createData(args, this.user)
          .then((rows) => [
            ...dataByIdResponse(
              rows,
              rows.map(({ id }) => id),
              DATA_ATTRIBUTES
            ),
          { path: ["dms", "data", `${app}+${type}`], invalidated: true },
          ])
          .catch(e => {
            console.log('error', e)
          });
      },
    },
    {
      route: "dms.data.delete",
      call: function(callPath, args) {
        const [app, type, ...ids] = args;
        return controller.deleteData(ids, this.user).then((rows) => [
          ...ids.map((id) => ({
            path: ["dms", "data", "byId", id],
            invalidated: true,
          })),
          { path: ["dms", "data", `${app}+${type}`], invalidated: true },
        ]);
      },
    },
  ];
}


module.exports = createRoutes(controller);
module.exports.createRoutes = createRoutes;
