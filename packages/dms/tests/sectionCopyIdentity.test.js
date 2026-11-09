/**
 * Copy / paste / duplicate must not hand two pages the same component row.
 *
 * A page's `sections` / `draft_sections` is a list of `{id, ref}` POINTERS at component rows, not
 * the content. So any path that copies a page by copying that list verbatim produces two pages
 * pointing at one set of rows: editing either edits both, and deleting one deletes the other's
 * content. It is silent — both pages render fine until someone changes one of them.
 *
 * Measured on `rowauth-test` (planning/tasks/current/row-auth-parentage.md): 72 components were
 * listed by two pages each, 54 of them from `mitigateny_county_template_copy`, which is a page used
 * as a template — the case `newPage()` got wrong.
 *
 * `trackingId` is the second half of the same problem: it is the `$self` stable id, so two live
 * sections sharing one collide even when the rows are distinct.
 *
 * Covers the sweep in that task's Remaining 4, and
 * planning/tasks/current/page-from-template-shares-section-rows.md.
 */
import { describe, it, expect } from "vitest";
import { sanitizeSectionsForTemplate } from "../src/patterns/utils";
import { newPage, duplicateItem } from "../src/patterns/page/pages/edit/editFunctions";
import { handlePaste } from "../src/patterns/page/components/sections/section_utils";

// A section as it is listed on a saved page: a pointer plus the inlined content the editor holds.
const liveSection = (over) => ({
    id: "9001",
    ref: "myapp+county|component",
    trackingId: "tmpl-tracking-1",
    is_draft: true,
    draft_id: "d1",
    title: "Hazards",
    element: { "element-type": "lexical", "element-data": "{}" },
    ...over,
});

const captureApiUpdate = () => {
    const calls = [];
    return [calls, async (payload) => { calls.push(payload); }];
};

describe("sanitizeSectionsForTemplate", () => {
    it("strips every field that names a row, and keeps the content", () => {
        const [clean] = sanitizeSectionsForTemplate([liveSection()]);
        expect(clean.id).toBeUndefined();
        expect(clean.ref).toBeUndefined();
        expect(clean.draft_id).toBeUndefined();
        expect(clean.is_draft).toBeUndefined();
        expect(clean.title).toBe("Hazards");
        expect(clean.element["element-type"]).toBe("lexical");
    });

    it("does not mutate the source", () => {
        const src = liveSection();
        sanitizeSectionsForTemplate([src]);
        expect(src.id).toBe("9001");
    });

    it("tolerates a missing list", () => {
        expect(sanitizeSectionsForTemplate(undefined)).toEqual([]);
    });
});

describe("newPage() from a template", () => {
    // The live defect: `mitigateny_county_template_copy` is an ordinary PAGE row used as a
    // template, so its draft_sections still name its own component rows.
    const pageUsedAsTemplate = { draft_sections: [liveSection(), liveSection({ id: "9002", trackingId: "tmpl-tracking-2" })] };

    it("does not give the new page the template's component rows", async () => {
        const [calls, apiUpdate] = captureApiUpdate();
        await newPage({}, [], { email: "a@b.c" }, apiUpdate, pageUsedAsTemplate);
        const sections = calls[0].data.draft_sections;
        expect(sections).toHaveLength(2);
        for (const s of sections) {
            expect(s.id).toBeUndefined();
            expect(s.ref).toBeUndefined();
            expect(s.is_draft).toBeUndefined();
            expect(s.draft_id).toBeUndefined();
        }
    });

    it("mints a fresh trackingId per section", async () => {
        const [calls, apiUpdate] = captureApiUpdate();
        await newPage({}, [], { email: "a@b.c" }, apiUpdate, pageUsedAsTemplate);
        const ids = calls[0].data.draft_sections.map(s => s.trackingId);
        expect(ids).not.toContain("tmpl-tracking-1");
        expect(ids).not.toContain("tmpl-tracking-2");
        expect(new Set(ids).size).toBe(2);
    });

    it("carries the content across", async () => {
        const [calls, apiUpdate] = captureApiUpdate();
        await newPage({}, [], { email: "a@b.c" }, apiUpdate, pageUsedAsTemplate);
        expect(calls[0].data.draft_sections[0].title).toBe("Hazards");
    });

    it("leaves the template itself untouched", async () => {
        const [, apiUpdate] = captureApiUpdate();
        await newPage({}, [], { email: "a@b.c" }, apiUpdate, pageUsedAsTemplate);
        expect(pageUsedAsTemplate.draft_sections[0].id).toBe("9001");
        expect(pageUsedAsTemplate.draft_sections[0].trackingId).toBe("tmpl-tracking-1");
    });

    it("still works for a SAVED template, whose sections were already sanitized", async () => {
        const saved = { draft_sections: sanitizeSectionsForTemplate([liveSection()]) };
        const [calls, apiUpdate] = captureApiUpdate();
        await newPage({}, [], { email: "a@b.c" }, apiUpdate, saved);
        expect(calls[0].data.draft_sections[0].id).toBeUndefined();
        expect(calls[0].data.draft_sections[0].title).toBe("Hazards");
    });
});

describe("duplicateItem()", () => {
    it("gives the duplicate its own rows in both arrays", async () => {
        const [calls, apiUpdate] = captureApiUpdate();
        const src = {
            id: "500", title: "Plan", index: 0,
            sections: [liveSection()],
            draft_sections: [liveSection({ id: "9002" })],
        };
        await duplicateItem(src, [], { email: "a@b.c" }, apiUpdate);
        for (const s of [...calls[0].data.sections, ...calls[0].data.draft_sections]) {
            expect(s.id).toBeUndefined();
            expect(s.ref).toBeUndefined();
            expect(s.trackingId).not.toBe("tmpl-tracking-1");
        }
        expect(calls[0].data.id).toBeUndefined();
    });
});

describe("handlePaste() — content moves, identity does not", () => {
    const paste = async (clipboard, target) => {
        Object.defineProperty(globalThis, "navigator", {
            value: { clipboard: { readText: async () => JSON.stringify(clipboard) } },
            configurable: true, writable: true,
        });
        let got = null;
        await handlePaste({ preventDefault() {} }, () => {}, () => {}, target, (v) => { got = v; });
        return got;
    };

    const target = {
        id: "7777", ref: "myapp+county|component", trackingId: "target-tracking",
        draft_id: "dTarget", is_draft: true, title: "Target",
    };

    it("keeps the target's own row and stable id", async () => {
        const out = await paste(liveSection({ title: "Copied" }), target);
        expect(out.id).toBe("7777");
        expect(out.ref).toBe("myapp+county|component");
        expect(out.trackingId).toBe("target-tracking");
        expect(out.draft_id).toBe("dTarget");
        expect(out.is_draft).toBe(true);
    });

    it("takes the content", async () => {
        const out = await paste(liveSection({ title: "Copied" }), target);
        expect(out.title).toBe("Copied");
        expect(out.element["element-type"]).toBe("lexical");
    });

    it("does not reintroduce a retired `parent` from an old clipboard payload", async () => {
        // `data.parent` was removed on 2026-10-29 (dms-server routes/dms/rowAuth.js's header), but
        // a payload copied before then still carries one, and it names a page this section is not on.
        const legacy = liveSection({ parent: JSON.stringify({ id: "4242", ref: "myapp+county|page" }) });
        const out = await paste(legacy, target);
        expect(out.parent).toBeUndefined();
    });

    it("ignores a payload that is not a section", async () => {
        const out = await paste({ title: "no element here" }, target);
        expect(out).toBeNull();
    });
});
