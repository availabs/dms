import { Model } from 'falcor'
import ModelRoot from "falcor/lib/ModelRoot"
import HttpDataSource from './falcor-http-datasource'
//import HttpDataSource from 'falcor-http-datasource'
import { Promise } from "bluebird";

import throttle from "lodash/throttle"

class CustomSource extends HttpDataSource {
 onBeforeRequest (config) {
   // if (window && window.localStorage) {
   //   const userToken = window.localStorage.getItem('userToken');
   //   if (userToken) {
   //     config.headers['Authorization'] = userToken;
   //   }
   // }
 }
}

function cacheFromStorage () {
 let falcorCache = {}
 // if (localStorage && localStorage.getItem('falcorCache')) {
 //   let token = localStorage.getItem('token')
 //   let user = localStorage.getItem('currentUser')
 //   if (token && user) {
 //     falcorCache = JSON.parse(localStorage.getItem('falcorCache'))
 //   }
 // }
 return falcorCache;
}

const noop = () => {};

const chunker = (values, request, options = {}) => {
  const {
    placeholder = "replace_me",
    chunkSize = 100
  } = options;

  const requests = [];

  for (let n = 0; n < values.length; n += chunkSize) {
    requests.push(request.map(r => r === placeholder ? values.slice(n, n + chunkSize) : r));
  }
  return requests.length ? requests : [request];
}
const falcorChunker = (requests, options = {}) => {
  const {
    falcor,
    onProgress = noop,
    concurrency = 5,
    ...rest
  } = options;

  const throttledCB = throttle(onProgress, 50);

  let progress = 0, total = 0;

  let chunks = requests.reduce((accum, [val, req]) => {
    const chunked = chunker(val, req, rest);
    total += chunked.length;
    accum.push(...chunked);
    return accum;
  }, [])

  // return chunks
  // .reduce((a, c) => {
  //     return a.then(() => falcor.get(c))
  //       .then(() => {
  //         throttledCB(++progress, total);
  //       });
  //   }, Promise.resolve());
  return Promise
    .map(chunks, c =>
       falcor.get(c)
         .then(() => {
          throttledCB(++progress, total);
        })
    , { concurrency })
}

const getArgs = args =>
  args.reduce((a, c) => {
    if (Array.isArray(c)) {
      a[0].push(c);
    }
    else {
      a[1] = c;
    }
    return a;
 }, [[], {}])

const falcorChunkerNice = (...args) => {
  const [requests, options] = getArgs(args);
  const {
    index = null,
    placeholder = "replace_me",
    ...rest
  } = options;

  const reduced = requests.reduce((a, c) => {
    let values = [], found = false;

    const request = c.map((r, i) => {
      if (Array.isArray(r) && r.length && !found && (index === null || index === i)) {
        found = true;
        values = r;
        return placeholder;
      }
      return r;
    });
    a.push([values, request]);
    return a;
  }, []);
  return falcorChunker(reduced, { ...rest, placeholder });
}

// let counter = 0;
class MyModelRoot extends ModelRoot {
 constructor(...args) {
   super(...args);

   this.listeners = [];

   this.onChange = this.onChange.bind(this);
   this.listen = this.listen.bind(this);
   this.unlisten = this.unlisten.bind(this);
 }
 onChange() {
   this.listeners.forEach(func => func());
 }
 listen(func) {
   if (!this.listeners.includes(func)) {
     this.listeners.push(func);
   }
 }
 unlisten(func) {
   this.listeners = this.listeners.filter(f => f !== func);
 }
}
class MyModel extends Model {
 constructor(...args) {
   super(...args);

   this.onChange = this.onChange.bind(this);
   this.remove = this.remove.bind(this);
   this.chunk = this.chunk.bind(this);
 }
 onChange(listener, func) {
   this._root.listen(listener, func);
 }
 remove(listener) {
   this._root.unlisten(listener);
 }
 get(...args) {
   return super.get(...args).then(res => res);
 }
 chunk(...args) {
   const [requests, options] = getArgs(args);
   return falcorChunkerNice(...requests, { falcor: this, ...options });
 }
}

export const falcorGraph = API_HOST =>
  new MyModel({
    _root: new MyModelRoot(),
    source: new CustomSource(API_HOST + '/graph', {
      crossDomain: true,
      withCredentials: false,
      timeout: 120000
    }),
    errorSelector: (path, error) => {
      console.log('errorSelector', path, error);
      return error;
    },
    cache: cacheFromStorage()
  })//.batch()


export const falcor = falcorGraph('https://graph.availabs.org')