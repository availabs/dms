import Fuse from "fuse.js"

export const FuseWrapper = (stuff, options) => {
  const fuse = new Fuse(stuff, options)
  return search => {
    if (!search) return stuff;
    return fuse.search(search).map(f => f.item);
  }
}
