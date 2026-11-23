/**
 * Loading plugins installed at run time (src/plugins/load.js, peers.js).
 * Task: src/dms/planning/tasks/current/dms-plugin-system.md (P2 plan step 4)
 *
 * Plugin modules are written to a temp folder and imported by file URL, as the server render imports them from the
 * plugins folder. Covers: which activation rows ask for a load; the host's React shared before the import; an
 * installed plugin registered opt-in whatever it declares; a module that is another plugin or another version
 * refused; a broken one left out without failing the rest; a second version in the same realm refused; a
 * compiled-in plugin never loaded over.
 *
 * Run: npx vitest run src/dms/packages/dms/tests/pluginLoad.test.js
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Window } from "happy-dom";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let P, L, dir;
const write = (file, src) => { const p = path.join(dir, file); fs.writeFileSync(p, src); return pathToFileURL(p).href; };
const pluginSrc = (name, version, { declare = "default-on", body = "" } = {}) => `
const peers = globalThis.__DMS_PLUGIN_PEERS__;
if (!peers || !peers.react || !peers.react.useState) throw new Error("peers not shared");
${body}
export default { name: ${JSON.stringify(name)}, version: ${JSON.stringify(version)}, api: "^1.0", activation: ${JSON.stringify(declare)},
  register(host) { host.registerPatternTypes({ ${name}_type: { label: "x", siteConfig: [] } }) } };
`;

beforeAll(async () => {
    const window = new Window({ url: "http://localhost/" });
    globalThis.window = window;
    globalThis.document = window.document;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dms-plugin-load-"));
    P = await import("../src/plugins/index.js");
    L = await import("../src/plugins/load.js");
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("installedActivations", () => {
    it("lists enabled activation rows that name a version", () => {
        const site = { plugin_activations: [
            { plugin: "a", enabled: true, version: "1.0.0" },
            { plugin: "b", enabled: "false", version: "1.0.0" },
            { plugin: "c", enabled: true },
            { enabled: true, version: "1.0.0" },
            { plugin: "d", version: " 2.1.0 " },
        ] };
        expect(L.installedActivations(site)).toEqual([{ name: "a", version: "1.0.0" }, { name: "d", version: "2.1.0" }]);
        expect(L.installedActivations({})).toEqual([]);
    });
    it("leaves out a plugin compiled into the app", () => {
        P.registerPlugin({ name: "t_compiled", version: "1.0.0", api: "^1.0", activation: "default-on", register() {} });
        expect(L.installedActivations({ plugin_activations: [{ plugin: "t_compiled", enabled: true, version: "9.9.9" }] })).toEqual([]);
    });
    it("builds the API host's URL", () => {
        expect(L.clientPluginUrl("https://api.x/", "hello", "1.0.0")).toBe("https://api.x/_dms/plugins/hello/1.0.0/client.js");
    });
});

describe("loadPlugins", () => {
    it("shares the host's React, imports, and registers the plugin opt-in", async () => {
        const url = write("t_one.mjs", pluginSrc("t_one", "1.0.0", { declare: "default-on" }));
        expect(await L.loadPlugins([{ name: "t_one", version: "1.0.0", url }])).toEqual(["t_one"]);
        expect(globalThis.__DMS_PLUGIN_PEERS__.react.useState).toBeTypeOf("function");
        expect(P.getPlugin("t_one")).toMatchObject({ version: "1.0.0", activation: "opt-in" });
        expect(P.isPluginActive("t_one", {})).toBe(false);
        expect(P.isPluginActive("t_one", { t_one: { enabled: true } })).toBe(true);
        expect(P.pluginOf("patternTypes", "t_one_type")).toBe("t_one");
    });
    it("is idempotent, and refuses a second version in the same realm", async () => {
        const url = write("t_one_v2.mjs", pluginSrc("t_one", "2.0.0"));
        expect(await L.loadPlugins([{ name: "t_one", version: "2.0.0", url }])).toEqual(["t_one"]);
        expect(P.getPlugin("t_one").version).toBe("1.0.0");
    });
    it("refuses a module that is another plugin or another version, without failing the others", async () => {
        const other = write("t_other.mjs", pluginSrc("t_somebody", "1.0.0"));
        const wrongVersion = write("t_ver.mjs", pluginSrc("t_ver", "1.0.1"));
        const broken = write("t_broken.mjs", pluginSrc("t_broken", "1.0.0", { body: 'throw new Error("boom")' }));
        const good = write("t_good.mjs", pluginSrc("t_good", "1.0.0"));
        const err = console.error; const seen = []; console.error = (m) => seen.push(String(m));
        const done = await L.loadPlugins([
            { name: "t_other", version: "1.0.0", url: other },
            { name: "t_ver", version: "1.0.0", url: wrongVersion },
            { name: "t_broken", version: "1.0.0", url: broken },
            { name: "t_nourl", version: "1.0.0", url: null },
            { name: "t_good", version: "1.0.0", url: good },
        ]);
        console.error = err;
        expect(done).toEqual(["t_good"]);
        expect(P.getPlugin("t_somebody")).toBe(null);
        expect(P.getPlugin("t_ver")).toBe(null);
        const all = seen.join("\n");
        for (const why of [/not plugin "t_other"/, /version 1\.0\.1, not 1\.0\.0/, /boom/, /no URL/]) expect(all).toMatch(why);
    });
    it("loadSitePlugins resolves each active installed plugin's URL", async () => {
        const url = write("t_site.mjs", pluginSrc("t_site", "1.2.3"));
        const asked = [];
        const done = await L.loadSitePlugins({ plugin_activations: [{ plugin: "t_site", enabled: true, version: "1.2.3" }, { plugin: "t_off", enabled: false, version: "1.0.0" }] },
            (name, version) => { asked.push(`${name}@${version}`); return url; });
        expect(asked).toEqual(["t_site@1.2.3"]);
        expect(done).toEqual(["t_site"]);
        expect(await L.loadSitePlugins({ plugin_activations: [] }, () => url)).toEqual([]);
    });
});
