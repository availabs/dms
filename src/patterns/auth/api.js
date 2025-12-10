

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

export const callAuthServer = (url, body, options = {}) =>
    fetch(url, {
        method: "POST",
        headers: {
            Accept: 'application/json, text/plain',
            "Content-type": "application/json"
        },
        body: JSON.stringify(body),
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
        body: JSON.stringify(body),
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
