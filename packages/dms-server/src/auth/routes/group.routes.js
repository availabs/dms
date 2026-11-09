const handlers = require('../handlers/group');

module.exports = [
  { route: '/groups', method: 'post', handler: handlers.getGroups },
  { route: '/groups/byproject', method: 'post', handler: handlers.groupsForProject },
  { route: '/groups/linkable', method: 'post', handler: handlers.linkableGroups },
  { route: '/group/create', method: 'post', handler: handlers.createGroup },
  { route: '/group/create/project/assign', method: 'post', handler: handlers.createAndAssign },
  { route: '/group/delete', method: 'post', handler: handlers.deleteGroup },
  // Read-only previews of the destructive routes above them: a destructive route never takes a preview
  // flag (task destructive-call-plan-routes), so an old server 404s here instead of deleting.
  { route: '/group/delete/plan', method: 'post', handler: handlers.planDeleteGroup },
  { route: '/group/project/assign', method: 'post', handler: handlers.assignToProject },
  { route: '/group/project/remove', method: 'post', handler: handlers.removeFromProject },
  { route: '/group/project/remove/plan', method: 'post', handler: handlers.planRemoveFromProject },
  { route: '/group/project/adjust', method: 'post', handler: handlers.adjustAuthLevel },
  { route: '/group/meta/update', method: 'post', handler: handlers.updateGroup },
];
