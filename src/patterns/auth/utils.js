
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