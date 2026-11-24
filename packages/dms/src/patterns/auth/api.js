

export const getUser = ({AUTH_HOST, PROJECT_NAME}) => {
    const token = window.localStorage.getItem('userToken');

    if(!token) return;

    return callAuthServer(`${ AUTH_HOST }/auth`, {
        token, project: PROJECT_NAME
    })
        .then(res => {
            if (res.error) {
                console.error('Error:', res.error);
            }
            else {
                return {...res.user, authed: true, isAuthenticating: false}
            }
        })
        .catch(error => {
            console.error('Cannot contact authentication server.');
        });
}

// The session cookie (rsc-view-pages.md phase 1): the page's own host keeps an HttpOnly copy of the token so
// its server render knows who is asking. Called on sign-in and sign-out, and on load when the server's state
// differs from the stored token (providers.jsx). Only where pages come from dms-server (window.__dmsSSRData is
// set, or window.__dmsIslandsPage on an islands page); a static host has no /_session. The cookie is read only to render pages: API calls keep the header.
export const syncSessionCookie = (token) => {
    if (typeof window === 'undefined' || !(window.__dmsSSRData || window.__dmsIslandsPage)) return Promise.resolve();
    return fetch('/_session', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(token ? { token } : {}),
    }).catch(() => {});
};

// The auth row that governs this site's auth calls: the server reads its grants (auth-users,
// auth-groups, view-as) on the SITE ROW of the `app` a call names (dms-server auth/utils/permissions.js).
// Set by the auth pattern's route config once the site's patterns are known (auth/siteConfig.jsx);
// one site per page load, so module state is enough. A body that names its own keeps them.
let authRequestScope = {};
export const setAuthRequestScope = ({ app } = {}) => {
    authRequestScope = app ? { app } : {};
};
const withAuthScope = (body) => ({ ...authRequestScope, ...body });

export const callAuthServer = (url, body, options = {}) =>
    fetch(url, {
        method: "POST",
        headers: {
            Accept: 'application/json, text/plain',
            "Content-type": "application/json"
        },
        body: JSON.stringify(withAuthScope(body)),
        ...options
    })
        .then(r => {
            if (r.ok) {
                return r.json();
            }
            throw new Error("There was a network problem.")
        });

export const getGroups = async ({user={}, AUTH_HOST, PROJECT_NAME}) => {
    return callAuthServer(`${AUTH_HOST}/groups/byproject`, {
        token: user.token,
        project: PROJECT_NAME
    })
}

export const getUsers = async ({user, AUTH_HOST, PROJECT_NAME}) => {
    return callAuthServer(`${AUTH_HOST}/users/byProject`, {
        token: user.token,
        project: PROJECT_NAME
    })
}


export const getAPI = ({AUTH_HOST, PROJECT_NAME}) => {
  return {
    getUser: () => {
      const token = window.localStorage.getItem('userToken');

      if (!token) return;

      return callAuthServer(`${AUTH_HOST}/auth`, {
        token, project: PROJECT_NAME
      })
        .then(res => {
          if (res.error) {
            console.log('Auth Error:', res.error);
          }
          else {
            return { ...res.user, groups: [...(res.user.groups || []), 'public'], authed: true, isAuthenticating: false }
          }
        })
        .catch(error => {
          console.error('Cannot contact authentication server.');
        });
    },
    callAuthServer: (path, body, options = {}) => {
      return fetch(`${AUTH_HOST}${path}`, {
        method: "POST",
        headers: {
          Accept: 'application/json, text/plain',
          "Content-type": "application/json"
        },
        body: JSON.stringify(withAuthScope(body)),
        ...options
      })
        .then(r => {
          if (r.ok) {
            return r.json();
          }
          throw new Error("There was a network problem.")
        });
    },
    getGroups: async ({ user = {} }) => {
      const groups = await callAuthServer(`${AUTH_HOST}/groups/byproject`, {
        token: user?.token,
        project: PROJECT_NAME
      })
        if(!groups.groups.some(g => g.name === 'public')){
            groups.groups = [{name: 'public'}, ...groups.groups];
        }
        return groups;
    },
    getUsers: async ({ user = {} }) => {
      return callAuthServer(`${AUTH_HOST}/users/byProject`, {
        token: user?.token,
        project: PROJECT_NAME
      })
    }
  }
}
