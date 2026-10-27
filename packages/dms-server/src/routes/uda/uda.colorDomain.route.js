const { atom: $atom } = require('falcor-json-graph');
const { colorDomain } = require('./uda.colorDomain.controller');
const { allowViewRead } = require('./readAuth');

module.exports = [
  {
    route: 'uda[{keys:envs}].viewsById[{keys:viewIds}].colorDomain[{keys:optionsKeys}]',
    get: async function (pathSet) {
      const { envs, viewIds, optionsKeys } = pathSet;
      const result = [];

      for (const env of envs) {
        for (const viewId of viewIds) {
          for (const optionsKey of optionsKeys) {
            try {
              // view-source on the view's source (readAuth.js); a refused read gets an empty domain
              const readable = await allowViewRead({ env, viewId, user: this.user, subdomain: this.subdomain || '', patternRef: this.patternRef || null, kind: 'data' });
              const domain = readable ? await colorDomain(env, viewId, optionsKey) : { breaks: [], min: 0, max: 0, count: 0 };
              result.push({
                path: ['uda', env, 'viewsById', viewId, 'colorDomain', optionsKey],
                value: $atom(domain),
              });
            } catch (err) {
              console.error(`colorDomain error env=${env} viewId=${viewId}:`, err.message);
              result.push({
                path: ['uda', env, 'viewsById', viewId, 'colorDomain', optionsKey],
                value: $atom({ error: err.message, breaks: [], min: 0, max: 0, count: 0 }),
              });
            }
          }
        }
      }
      return result;
    },
  },
];
