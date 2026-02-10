const handlers = require('../handlers/auth');

module.exports = [
  { route: '/login', method: 'post', handler: handlers.login },
  { route: '/auth', method: 'post', handler: handlers.auth },
  { route: '/signup/request', method: 'post', handler: handlers.signupRequest },
  { route: '/signup/request/verify', method: 'post', handler: handlers.signupRequestVerified },
  { route: '/signup/accept', method: 'post', handler: handlers.signupAccept },
  { route: '/signup/reject', method: 'post', handler: handlers.signupReject },
  { route: '/signup/delete', method: 'post', handler: handlers.deleteSignup },
  { route: '/signup/assign/group', method: 'post', handler: handlers.signupAssignGroup },
  { route: '/email/verify', method: 'post', handler: handlers.verifyEmail },
  { route: '/invite', method: 'post', handler: handlers.sendInvite },
  { route: '/invite/accept', method: 'post', handler: handlers.acceptInvite },
  { route: '/requests', method: 'post', handler: handlers.getRequests },
  { route: '/requests/byProject', method: 'post', handler: handlers.getRequestsForProject },
  { route: '/password/set', method: 'post', handler: handlers.passwordSet },
  { route: '/password/force', method: 'post', handler: handlers.passwordForce },
  { route: '/password/update', method: 'post', handler: handlers.passwordUpdate },
  { route: '/password/reset', method: 'post', handler: handlers.passwordReset },
  { route: '/create/user', method: 'post', handler: handlers.createUser },
  { route: '/init/setup', method: 'post', handler: handlers.initSetup },
];
