const handlers = require('../handlers/message');

module.exports = [
  { route: '/messages', method: 'post', handler: handlers.getMessages },
  { route: '/messages/post', method: 'post', handler: handlers.postMessage },
  { route: '/messages/view', method: 'post', handler: handlers.viewMessages },
  { route: '/messages/delete', method: 'post', handler: handlers.deleteMessages },
];
