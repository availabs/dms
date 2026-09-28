/**
 * SSR-safe code splitting (utils/lazyComponent.js,
 * planning/tasks/completed/bundle-split-initial-graph.md).
 *
 * The property that matters: once a lazy component's chunk is loaded, it
 * renders SYNCHRONOUSLY — including under renderToString, which never waits
 * for Suspense — so splitting a component out of the eager bundle doesn't
 * change server-rendered HTML, and the ids the server rendered are reported
 * so the client can load the same chunks before hydrateRoot.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

import {
  lazyComponent,
  preloadAllLazyComponents,
  preloadLazyComponents,
  collectRenderedLazyComponents,
} from "../src/utils/lazyComponent.js";

const h = React.createElement;
const Fallback = () => h("i", null, "loading");
const moduleOf = (Comp) => () => Promise.resolve({ default: Comp });

describe("lazyComponent", () => {
  it("renders the fallback on the server when not preloaded (why SSR must preload)", () => {
    const Hello = ({ name }) => h("b", null, `hello ${name}`);
    const LazyHello = lazyComponent("test/not-preloaded", moduleOf(Hello), { fallback: h(Fallback) });
    const html = renderToString(h(LazyHello, { name: "x" }));
    expect(html).toContain("loading");
    expect(html).not.toContain("hello x");
  });

  it("renders synchronously once preloaded — same HTML as the unsplit component", async () => {
    const Hello = ({ name }) => h("b", null, `hello ${name}`);
    const LazyHello = lazyComponent("test/preloaded", moduleOf(Hello), { fallback: h(Fallback) });
    await LazyHello.preload();
    const html = renderToString(h(LazyHello, { name: "y" }));
    expect(html).toContain("<b>hello y</b>");
    expect(html).not.toContain("loading");
  });

  it("preloadAllLazyComponents loads lazies registered inside other lazy modules", async () => {
    let Inner;
    const Outer = () => h("div", null, h(Inner));
    const LazyOuter = lazyComponent("test/outer", async () => {
      // registered only when the outer module evaluates
      Inner = lazyComponent("test/inner", moduleOf(() => h("span", null, "inner")));
      return { default: Outer };
    });
    await preloadAllLazyComponents();
    const [html, ids] = collectRenderedLazyComponents(() => renderToString(h(LazyOuter)));
    expect(html).toContain("<span>inner</span>");
    expect(ids).toEqual(expect.arrayContaining(["test/outer", "test/inner"]));
  });

  it("collectRenderedLazyComponents reports only the ids that rendered", async () => {
    const A = lazyComponent("test/collect-a", moduleOf(() => h("a", null, "A")));
    lazyComponent("test/collect-b", moduleOf(() => h("b", null, "B")));
    await preloadAllLazyComponents();
    const [html, ids] = collectRenderedLazyComponents(() => renderToString(h(A)));
    expect(html).toContain("A");
    expect(ids).toEqual(["test/collect-a"]);
    // nothing leaks outside the collection window
    const [, again] = collectRenderedLazyComponents(() => "no render");
    expect(again).toEqual([]);
  });

  it("preloadLazyComponents loads only the named ids", async () => {
    let loadedC = 0, loadedD = 0;
    lazyComponent("test/named-c", () => { loadedC++; return Promise.resolve({ default: () => null }); });
    lazyComponent("test/named-d", () => { loadedD++; return Promise.resolve({ default: () => null }); });
    await preloadLazyComponents(["test/named-c", "test/unknown"]);
    expect(loadedC).toBe(1);
    expect(loadedD).toBe(0);
  });

  it("dedupes concurrent loads", async () => {
    let calls = 0;
    const L = lazyComponent("test/dedupe", () => { calls++; return Promise.resolve({ default: () => null }); });
    await Promise.all([L.preload(), L.preload(), preloadLazyComponents(["test/dedupe"])]);
    expect(calls).toBe(1);
  });
});
