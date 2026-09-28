// The code-split graph component (UI.Graph). Its own module so both ui/index.js
// and the Graph section config (which preloads it from the page loader) share
// one lazy wrapper. See planning/tasks/completed/bundle-split-initial-graph.md.
import { lazyComponent } from "../../../utils/lazyComponent";

export const LazyGraph = lazyComponent('ui/Graph', () => import("./index.jsx"));
