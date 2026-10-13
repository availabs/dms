/**
 * Page variables a section registers itself — the section-registry
 * `derivePageVariables` hook (the generic replacement for the page pattern's old
 * map-only share-state lookup). The Map section's own hook is tested with the
 * map editor pattern in dms-template (src/patterns/mapeditor/mapeditor.test.js).
 *
 * See planning/tasks/current/pluggable-patterns-mapeditor-extraction.md.
 *
 * Run: npx vitest run src/dms/packages/dms/tests/sectionPageVariables.test.js
 */
import { describe, it, expect } from "vitest";

import "../src/patterns";
import { registerComponents } from "../src/patterns/page/components/sections/componentRegistry";
import { deriveSectionPageVariables, getPageVariableRegistry } from "../src/patterns/page/pages/_utils";

const section = (type, data) => ({ element: { "element-type": type, "element-data": JSON.stringify(data) } });
const autoVar = (searchKey) => ({ id: `test_${searchKey}`, searchKey, values: [], useSearchParams: true, auto: true });

// a section type that owns one page variable per `keys` entry in its element-data
registerComponents({
    "Test Vars": { name: "Test Vars", derivePageVariables: (cfg) => (cfg.keys || []).map(autoVar) },
    "Test Vars: Legacy": { name: "Test Vars (legacy)", hideInSelector: true, derivePageVariables: (cfg) => (cfg.keys || []).map(autoVar) },
});

describe("deriveSectionPageVariables", () => {
    it("calls a registered component's hook with its parsed element-data", () => {
        const vars = deriveSectionPageVariables({ sections: [section("Test Vars", { keys: ["zone", "year"] })] });
        expect(vars.map(v => v.searchKey)).toEqual(["zone", "year"]);
    });

    it("ignores sections whose component has no hook, or isn't registered", () => {
        expect(deriveSectionPageVariables({ sections: [section("lexical", {}), section("Nope", { keys: ["x"] })] })).toEqual([]);
    });

    it("reads draft sections too, and matches element-types case-insensitively", () => {
        const vars = deriveSectionPageVariables({ draft_sections: [section("test vars: legacy", { keys: ["zone"] })] });
        expect(vars.map(v => v.searchKey)).toEqual(["zone"]);
    });

    it("dedupes across sections — the first section to claim a searchKey wins", () => {
        const vars = deriveSectionPageVariables({ sections: [
            section("Test Vars", { keys: ["shared", "a"] }),
            section("Test Vars", { keys: ["shared", "b"] }),
        ] });
        expect(vars.map(v => v.searchKey)).toEqual(["shared", "a", "b"]);
    });

    it("an authored page variable wins over a section-registered one", () => {
        const item = { sections: [section("Test Vars", { keys: ["zone"] })], filters: [{ searchKey: "zone", values: ["a"] }] };
        const registry = getPageVariableRegistry(item);
        expect(registry.filter(v => v.searchKey === "zone")).toHaveLength(1);
        expect(registry.find(v => v.searchKey === "zone").auto).toBeUndefined();
    });
});
