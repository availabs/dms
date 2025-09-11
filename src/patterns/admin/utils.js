
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

export const getUser = (AUTH_HOST, PROJECT_NAME) => {
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