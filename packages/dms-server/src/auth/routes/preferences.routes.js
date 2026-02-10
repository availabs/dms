const handlers = require('../handlers/preferences');

module.exports = [
  { route: '/preferences', method: 'post', handler: handlers.getPreferences },
  { route: '/preferences/update', method: 'post', handler: handlers.updatePreferences },
];
