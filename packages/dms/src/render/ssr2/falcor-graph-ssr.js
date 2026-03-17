// Server-safe Falcor graph for SSR.
// avl-falcor's falcorGraph() uses a CustomSource with onBeforeRequest that
// references `window.localStorage` for auth tokens. This fails in Node.
// This module creates an equivalent Falcor model without the browser dependency.

// Default imports from CJS work in Node's ESM interop; named imports don't.
import falcor from 'falcor'
import ModelRoot from 'falcor/lib/ModelRoot'
import HttpDataSource from '@availabs/avl-falcor/src/falcor-http-datasource/src/XMLHttpSource'

const { Model } = falcor

class SSRModelRoot extends ModelRoot {
  constructor(...args) {
    super(...args)
    this.listeners = []
    this.onChange = this.onChange.bind(this)
    this.listen = this.listen.bind(this)
    this.unlisten = this.unlisten.bind(this)
  }
  onChange() {
    this.listeners.forEach(func => func())
  }
  listen(func) {
    if (!this.listeners.includes(func)) {
      this.listeners.push(func)
    }
  }
  unlisten(func) {
    this.listeners = this.listeners.filter(f => f !== func)
  }
}

export function falcorGraphSSR(apiHost) {
  return new Model({
    _root: new SSRModelRoot(),
    source: new HttpDataSource(apiHost + '/graph', {
      crossDomain: true,
      withCredentials: false,
      timeout: 120000,
    }),
    errorSelector: (path, error) => {
      console.log('SSR errorSelector', path, error)
      return error
    },
  })
}
