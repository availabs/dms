const handlers = require('../handlers/project');

module.exports = [
  { route: '/projects', method: 'post', handler: handlers.getProjects },
  { route: '/project/create', method: 'post', handler: handlers.createProject },
  { route: '/project/delete', method: 'post', handler: handlers.deleteProject },
];
