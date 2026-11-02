const handlers = require('../handlers/user');

module.exports = [
  { route: '/users', method: 'post', handler: handlers.getUsers },
  { route: '/users/bygroup', method: 'post', handler: handlers.getUsersByGroup },
  { route: '/users/byProject', method: 'post', handler: handlers.getUsersByProject },
  { route: '/user/group/assign', method: 'post', handler: handlers.assignToGroup },
  { route: '/user/group/remove', method: 'post', handler: handlers.removeFromGroup },
  { route: '/user/delete', method: 'post', handler: handlers.deleteUser },
  { route: '/user/project/remove', method: 'post', handler: handlers.removeFromProject },
  // Read-only preview of the route above (a destructive route never takes a preview flag).
  { route: '/user/project/remove/plan', method: 'post', handler: handlers.planRemoveFromProject },
  { route: '/user/create/fake', method: 'post', handler: handlers.createFake },
  { route: '/users/preferences', method: 'post', handler: handlers.getUsersPreferences },
];
