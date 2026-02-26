const handlers = require('../handlers/group');

module.exports = [
  { route: '/groups', method: 'post', handler: handlers.getGroups },
  { route: '/groups/byproject', method: 'post', handler: handlers.groupsForProject },
  { route: '/group/create', method: 'post', handler: handlers.createGroup },
  { route: '/group/create/project/assign', method: 'post', handler: handlers.createAndAssign },
  { route: '/group/delete', method: 'post', handler: handlers.deleteGroup },
  { route: '/group/project/assign', method: 'post', handler: handlers.assignToProject },
  { route: '/group/project/remove', method: 'post', handler: handlers.removeFromProject },
  { route: '/group/project/adjust', method: 'post', handler: handlers.adjustAuthLevel },
  { route: '/group/meta/update', method: 'post', handler: handlers.updateGroup },
];
