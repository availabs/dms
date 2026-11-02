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
import { deriveAuthVocabulary } from "../src/patterns/deriveAuthVocabulary.js";
import { PATTERN_ROW_DOMAIN } from "../src/patterns/patternRow.domain.js";
import cmsFormat from "../src/patterns/page/page.format.js";
import datasetsFormat from "../src/patterns/datasets/datasets.format.js";
import authFormat from "../src/patterns/auth/auth.format.js";
import siteFormat from "../src/patterns/admin/admin.format.js";

// The vocabularies are DERIVED now — these are what registerPatternTypes builds and validates.
const pageAuthVocabulary = deriveAuthVocabulary({ self: PATTERN_ROW_DOMAIN, formats: [cmsFormat] });
const datasetsAuthVocabulary = deriveAuthVocabulary({ self: PATTERN_ROW_DOMAIN, instance: datasetsFormat });
// `publicRead` is declared on the REGISTRY ENTRY now (patterns/index.js), not inside a vocabulary
// file, and registry.js folds it in after deriving. Mirrored here so these assertions still cover
// the object the server actually receives.
const authAuthVocabulary = { ...deriveAuthVocabulary({ self: PATTERN_ROW_DOMAIN, formats: [authFormat] }), publicRead: true };
const adminAuthVocabulary = { ...deriveAuthVocabulary({ self: PATTERN_ROW_DOMAIN, formats: [siteFormat] }), publicRead: true };

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

    it("derives from the formats — no hand-written vocabulary file survives", async () => {
        // Phase 3 deleted the seven `*.authVocabulary.js` files. The derivation and its frozen
        // test fixture are the only things left that may carry the word, so a new one reappearing
        // here means a second source of truth has crept back in.
        const { readdir } = await import("node:fs/promises");
        for (const dir of ["page", "datasets", "auth", "admin"]) {
            const files = await readdir(new URL(`../src/patterns/${dir}/`, import.meta.url));
            expect(files.filter(f => f.endsWith(".authVocabulary.js")), dir).toEqual([]);
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

/**
 * `publicRead` — a DECLARATION, not a scope.
 *
 * Regression for a bug that took the entire app down before it mounted: Phase 1 of
 * row-auth-consolidate.md put `publicRead: true` at the top level of the auth and admin
 * vocabularies, where the server's `publicReadOf()` reads it. The validator read every top-level
 * key as a scope, so `registerPatternTypes` threw
 *
 *     "auth" authVocabulary: unknown scope(s) publicRead — expected self / descendants
 *
 * at import time and nothing rendered. No server test could catch it — the server is what wanted
 * the key — and no client test existed for the two vocabularies that declare it. It was found by
 * loading the real app against the rowauth-test clone under `enforce`.
 */
describe("publicRead is a declaration, not a scope", () => {
    it("is accepted at the top level", () => {
        const v = { publicRead: true, self: [{ value: 'edit-pattern', implies: ['read', 'edit'] }] };
        expect(validateAuthVocabulary(v)).toBe(v);
    });

    it("does not count as a scope — a vocabulary of only declarations is still empty", () => {
        expect(() => validateAuthVocabulary({ publicRead: true })).toThrow(/declares no scopes/);
    });

    it("is rejected when it is not a boolean, so a typo fails loudly rather than closed", () => {
        expect(() => validateAuthVocabulary({ publicRead: 'yes', self: [] }))
            .toThrow(/publicRead must be a boolean/);
    });

    it("an actual unknown scope is still rejected, and the message names the declarations", () => {
        expect(() => validateAuthVocabulary({ publicRead: true, decendants: [] }))
            .toThrow(/unknown scope\(s\) decendants/);
    });

    it("never leaks into the Access editor's options", () => {
        const flat = flattenAuthVocabulary({ publicRead: true, self: [{ value: 'edit-pattern', implies: ['edit'] }] });
        expect(flat.map(e => e.value)).toEqual(['edit-pattern']);
    });

    it("the two vocabularies that declare it validate — the exact import that crashed", () => {
        expect(authAuthVocabulary.publicRead).toBe(true);
        expect(adminAuthVocabulary.publicRead).toBe(true);
        expect(() => validateAuthVocabulary(authAuthVocabulary, '"auth" authVocabulary')).not.toThrow();
        expect(() => validateAuthVocabulary(adminAuthVocabulary, '"admin" authVocabulary')).not.toThrow();
    });
});

/**
 * `permissionDomain` carries `implies`, and it must AGREE with the vocabulary.
 *
 * Phase 1 of permission-domain-single-source.md: the domains gain `implies` while the vocabulary
 * files are still authoritative, so the two are redundant ON PURPOSE for one phase — and this is
 * what keeps them honest until the derivation replaces the files in Phase 3. The existing
 * "covers its page domain" tests check only that a verb EXISTS in the vocabulary; a verb can still
 * carry different implications in the two places, which is exactly the drift this task exists to
 * end.
 */
describe("permissionDomain implies agrees with the vocabulary", () => {
    const entriesOf = (node, out = []) => {
        if (!node || typeof node !== 'object') return out;
        if (Array.isArray(node)) { node.forEach(n => entriesOf(n, out)); return out; }
        if (Array.isArray(node.permissionDomain)) out.push(...node.permissionDomain);
        for (const [k, v] of Object.entries(node)) if (k !== 'permissionDomain') entriesOf(v, out);
        return out;
    };
    const byVerb = (vocab) => {
        const m = new Map();
        for (const scope of ['self', 'descendants'])
            for (const e of (vocab[scope] || [])) m.set(e.value, e.implies);
        return m;
    };
    const sorted = (a) => [...(a || [])].sort().join(',');

    it.each([
        ['page', () => import("../src/patterns/page/page.format.js"), pageAuthVocabulary],
        ['datasets', () => import("../src/patterns/datasets/datasets.format.js"), datasetsAuthVocabulary],
    ])("%s: every domain entry declares the vocabulary's implications", async (name, load, vocab) => {
        const { default: format } = await load();
        const verbs = byVerb(vocab);
        const seen = [];
        for (const entry of entriesOf(format)) {
            if (entry.value === '*') continue;          // an affordance, never a declared verb
            seen.push(entry.value);
            expect(entry.implies, `${name}: "${entry.value}" has no implies`).toBeDefined();
            expect(verbs.has(entry.value), `${name}: "${entry.value}" is not in the vocabulary`).toBe(true);
            expect(sorted(entry.implies), `${name}: "${entry.value}" implies differ`)
                .toBe(sorted(verbs.get(entry.value)));
        }
        expect(seen.length).toBeGreaterThan(0);
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
