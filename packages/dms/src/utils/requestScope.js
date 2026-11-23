// Who a server render is for (rsc-view-pages.md phase 1, ssr-session-cookie.md). The SSR handler
// (render/ssr2/handler.jsx) runs each page request inside a scope { session, user, token, models } held by an
// AsyncLocalStorage, and installs the provider below; in the browser nothing installs one and every call
// returns null. Library code asks for the scope instead of importing node:async_hooks, so it stays
// browser-safe.
let provider = () => null

export function setRequestScopeProvider(fn) {
  provider = fn
}

/** The current server request's scope, or null (in the browser, or outside a page render). */
export function getRequestScope() {
  return provider()
}

/**
 * A data model that is shared by every anonymous request but private to a signed-in one.
 *
 * The route tree, and the Falcor model each pattern route holds, are built once per host and reused by every
 * request (render/ssr2/handler.jsx). Rows read with a user's token must never land in that shared cache, where
 * the next visitor would be served them. So on the server a route's model is this proxy: with no signed-in user
 * in scope it is the shared model itself; with one, each property goes to a model of that request's own, made
 * by `create(token)` on first use and dropped with the request. The token is attached by that model's own
 * data source (`create`), never by the shared one.
 *
 * @param {object} shared - the model anonymous requests use
 * @param {(token: string) => object} create - makes a model like `shared`, sending `token` on every request
 */
export function requestScopedModel(shared, create) {
  const current = () => {
    const scope = provider()
    if (!scope?.token) return shared
    let model = scope.models.get(create)
    if (!model) {
      model = create(scope.token)
      scope.models.set(create, model)
    }
    return model
  }
  return new Proxy(shared, {
    get(_target, prop) {
      const model = current()
      const value = Reflect.get(model, prop, model)
      return typeof value === 'function' ? value.bind(model) : value
    },
    set(_target, prop, value) {
      return Reflect.set(current(), prop, value)
    },
    has(_target, prop) {
      return Reflect.has(current(), prop)
    },
  })
}

/** Adds `Authorization: token` to every request a Falcor model's data source makes. */
export function sendTokenWith(model, token) {
  const source = model?._source
  if (!source || !token) return model
  const before = source.onBeforeRequest?.bind(source)
  source.onBeforeRequest = (config) => {
    before?.(config)
    config.headers = { ...(config.headers || {}), Authorization: token }
  }
  return model
}
