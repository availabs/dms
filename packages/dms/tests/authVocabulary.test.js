/**
 * A pattern type's declared auth vocabulary — the client half of
 * planning/tasks/current/row-auth-vocabulary.md.
 *
 * Two things are worth testing here and nowhere else:
 *
 *   1. `validateAuthVocabulary` really does refuse a malformed declaration, because the whole point
 *      of validating at registration is that a typo'd verb fails CLOSED and SILENTLY at runtime.
 *   2. Every verb an author can actually save from an Access editor appears in the vocabulary of the
 *      pattern it belongs to. A `permissionDomain` entry with no vocabulary entry is a grant the UI
 *      offers and the server reads as conferring nothing — invisible, and exactly the class of bug
 *      the vocabulary exists to end.
 *
 * Run: npx vitest run packages/dms/tests/authVocabulary.test.js
 */
import { describe, it, expect } from "vitest";

import { validateAuthVocabulary, flattenAuthVocabulary, STRUCTURAL_VERBS } from "../src/patterns/authVocabulary.js";
import pageAuthVocabulary from "../src/patterns/page/page.authVocabulary.js";
import datasetsAuthVocabulary from "../src/patterns/datasets/datasets.authVocabulary.js";
import authAuthVocabulary from "../src/patterns/auth/auth.authVocabulary.js";
import adminAuthVocabulary from "../src/patterns/admin/admin.authVocabulary.js";

const ok = { self: [{ value: 'edit-pattern', label: 'Edit', implies: ['read', 'edit'] }] };

describe("validateAuthVocabulary", () => {
    it("accepts a well-formed declaration", () => {
        expect(validateAuthVocabulary(ok)).toBe(ok);
    });

    it("refuses a non-structural verb in implies", () => {
        expect(() => validateAuthVocabulary({ self: [{ value: 'x', implies: ['edit-page'] }] }))
            .toThrow(/non-structural verb/);
    });

    it("refuses a missing implies — [] is how you say 'confers nothing'", () => {
        expect(() => validateAuthVocabulary({ self: [{ value: 'x' }] })).toThrow(/implies must be an array/);
        expect(() => validateAuthVocabulary({ self: [{ value: 'x', implies: [] }] })).not.toThrow();
    });

    it("refuses an empty value", () => {
        expect(() => validateAuthVocabulary({ self: [{ value: '', implies: [] }] })).toThrow(/non-empty string/);
    });

    it("refuses an unknown scope", () => {
        expect(() => validateAuthVocabulary({ everywhere: [] })).toThrow(/unknown scope/);
    });

    it("refuses a declaration with no scopes at all", () => {
        expect(() => validateAuthVocabulary({})).toThrow(/declares no scopes/);
    });

    it("allows a verb in both scopes, but only with one meaning", () => {
        expect(() => validateAuthVocabulary({
            self: [{ value: 'view-page', implies: ['read'] }],
            descendants: [{ value: 'view-page', implies: ['read'] }],
        })).not.toThrow();
        expect(() => validateAuthVocabulary({
            self: [{ value: 'view-page', implies: ['read'] }],
            descendants: [{ value: 'view-page', implies: ['edit'] }],
        })).toThrow(/one verb, one meaning/);
    });

    it("refuses a non-object", () => {
        expect(() => validateAuthVocabulary(null)).toThrow();
        expect(() => validateAuthVocabulary([])).toThrow();
    });
});

describe("the built-in vocabularies", () => {
    const BUILT_INS = {
        page: pageAuthVocabulary,
        datasets: datasetsAuthVocabulary,
        auth: authAuthVocabulary,
        admin: adminAuthVocabulary,
    };

    it.each(Object.keys(BUILT_INS))("%s validates", (name) => {
        expect(() => validateAuthVocabulary(BUILT_INS[name])).not.toThrow();
    });

    it.each(Object.keys(BUILT_INS))("%s declares only structural verbs", (name) => {
        for (const entry of flattenAuthVocabulary(BUILT_INS[name])) {
            for (const v of entry.implies) expect(STRUCTURAL_VERBS).toContain(v);
        }
    });

    it("is pure data — the migration manifest loads these files with no module graph", async () => {
        // scripts/emit-auth-vocabulary.mjs imports each file as a `data:` URL, which only works
        // while the file has no imports of its own. Keep it that way.
        const { readFile } = await import("node:fs/promises");
        for (const rel of [
            "src/patterns/page/page.authVocabulary.js",
            "src/patterns/datasets/datasets.authVocabulary.js",
            "src/patterns/auth/auth.authVocabulary.js",
            "src/patterns/admin/admin.authVocabulary.js",
        ]) {
            const src = await readFile(new URL(`../${rel}`, import.meta.url), "utf8");
            expect(src, rel).not.toMatch(/^\s*import\s/m);
        }
    });
});

describe("every grantable verb confers something", () => {
    // A `permissionDomain` value with no vocabulary entry is a grant the Access editor offers and
    // the server reads as conferring nothing.
    const values = (vocabulary) => new Set(flattenAuthVocabulary(vocabulary).map(e => e.value));

    it("the page pattern covers both its page- and section-level domains", async () => {
        const { default: format } = await import("../src/patterns/page/page.format.js");
        const declared = values(pageAuthVocabulary);
        const domains = collectPermissionDomains(format);
        expect(domains.length).toBeGreaterThan(1);          // page + section, at least
        for (const value of domains) {
            if (value === '*') continue;                      // always means everything, never declared
            expect(declared, `page vocabulary is missing "${value}"`).toContain(value);
        }
    });

    it("the datasets pattern covers its source domain", async () => {
        const { default: format } = await import("../src/patterns/datasets/datasets.format.js");
        const declared = values(datasetsAuthVocabulary);
        for (const value of collectPermissionDomains(format)) {
            if (value === '*') continue;
            expect(declared, `datasets vocabulary is missing "${value}"`).toContain(value);
        }
    });
});

/** Every `permissionDomain` value anywhere in a format tree. */
function collectPermissionDomains(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach(n => collectPermissionDomains(n, out)); return out; }
    if (Array.isArray(node.permissionDomain)) {
        for (const entry of node.permissionDomain) if (entry && entry.value) out.push(entry.value);
    }
    for (const v of Object.values(node)) collectPermissionDomains(v, out);
    return out;
}
