/**
 * The derivation that replaces the hand-written `*.authVocabulary.js` files.
 *
 * Phase 2 of planning/tasks/current/permission-domain-single-source.md. The point of this suite is
 * that the seven hand-written vocabularies are the ORACLE: the derivation must reproduce them
 * before Phase 3 deletes them. Where it deliberately differs, the difference is spelled out here
 * as an expectation, so an UNINTENDED divergence fails even though an intended one does not.
 *
 * Run: npx vitest run packages/dms/tests/deriveAuthVocabulary.test.js
 */
import { describe, it, expect } from "vitest";
import { deriveAuthVocabulary } from "../src/patterns/deriveAuthVocabulary.js";
import SHIPPED from "./fixtures/shippedAuthVocabularies.js";
import siteFormat from "../src/patterns/admin/admin.format.js";
import { PATTERN_ROW_DOMAIN } from "../src/patterns/patternRow.domain.js";

const pageAuthVocabulary = SHIPPED.page;
const datasetsAuthVocabulary = SHIPPED.datasets;
const adminAuthVocabulary = SHIPPED.admin;

/**
 * The pattern-row verbs every type has — read from the SHARED `admin+pattern` format, not retyped
 * here. Every pattern row of every type is an `admin+pattern` row, which is why five of the seven
 * hand-written vocabularies carried an identical `self` bucket. Retyping it in the test would
 * reintroduce exactly the duplication this task removes.
 */
const PATTERN_ADMIN = PATTERN_ROW_DOMAIN;

/** Compare on value + implies. Labels differ in case between the two lists by hand ("View Source"
 *  vs "View source"); the domain's label is the one the editor shows and therefore the one that
 *  survives, so a label difference is not a defect. */
const shape = (list) => (list || []).map(e => ({ value: e.value, implies: [...e.implies].sort() }))
    .sort((a, b) => a.value.localeCompare(b.value));

describe("deriveAuthVocabulary", () => {
    it("drops the `*` wildcard — an affordance, never a declared verb", () => {
        const d = deriveAuthVocabulary({ self: [{ value: '*' }, { value: 'edit-pattern', implies: ['read'] }] });
        expect(d.self.map(e => e.value)).toEqual(['edit-pattern']);
    });

    it("omits a scope with no verbs, as the hand-written files do", () => {
        expect(deriveAuthVocabulary({ self: [{ value: 'x', implies: [] }] })).not.toHaveProperty('descendants');
        expect(deriveAuthVocabulary({})).toEqual({});
    });

    it("LAST entry wins when one row kind is described twice — a configuration error, unenforced", () => {
        const d = deriveAuthVocabulary({
            formats: [
                { attributes: [{ permissionDomain: [{ value: 'view-page', implies: ['read'] }] }] },
                { attributes: [{ permissionDomain: [{ value: 'view-page', implies: ['read', 'edit'] }] }] },
            ],
        });
        expect(d.descendants).toEqual([{ value: 'view-page', implies: ['read', 'edit'] }]);
    });

    it("walks registerFormats, so a child format's domain lands in descendants", () => {
        const d = deriveAuthVocabulary({
            formats: [{
                attributes: [{ permissionDomain: [{ value: 'view-page', implies: ['read'] }] }],
                registerFormats: [{ attributes: [{ permissionDomain: [{ value: 'view', implies: ['read'] }] }] }],
            }],
        });
        expect(d.descendants.map(e => e.value)).toEqual(['view-page', 'view']);
    });

    describe("reproduces the hand-written vocabularies", () => {
        it("page — exactly, both scopes", async () => {
            const { default: cmsFormat } = await import("../src/patterns/page/page.format.js");
            const derived = deriveAuthVocabulary({ self: PATTERN_ADMIN, formats: [cmsFormat] });
            // deltas: `delete-pattern` moved to the site (decision 5); `view-pattern` is the
            // pattern-row read verb the shared domain adds (decision 2).
            expect(shape(derived.self)).toEqual(shape([
                ...pageAuthVocabulary.self.filter(e => e.value !== 'delete-pattern'),
                { value: 'view-pattern', implies: ['read'] },
            ]));
            expect(shape(derived.descendants)).toEqual(shape(pageAuthVocabulary.descendants));
        });

        it("datasets — pattern-level verbs move to `self` via the form-manager domain", async () => {
            const { default: datasetsFormat } = await import("../src/patterns/datasets/datasets.format.js");
            // `form-manager` is the row kind that IS the datasets pattern, so its domain joins the
            // shared pattern domain to make `self`. `view-sources` and `create-source` are
            // pattern-level by intent ("pattern level only" in adminPermissions.js), and
            // `view-page` in `descendants` is the live regression — it let a pattern's
            // `public: ['view-page']` open every source beneath it (row-auth-uda.md).
            const derived = deriveAuthVocabulary({ self: PATTERN_ADMIN, instance: datasetsFormat });

            expect(shape(derived.self)).toEqual(shape([
                ...datasetsAuthVocabulary.self
                    .filter(e => !['delete-pattern', 'view-page'].includes(e.value)),   // decisions 5 and 2
                { value: 'view-pattern',  implies: ['read'] },                          // renamed from view-page
                { value: 'view-sources',  implies: ['read'] },
                { value: 'create-source', implies: ['read', 'create'] },
            ]));

            // descendants loses exactly those three and keeps everything else
            const expected = datasetsAuthVocabulary.descendants
                .filter(e => !['view-page', 'view-sources', 'create-source'].includes(e.value));
            expect(shape(derived.descendants)).toEqual(shape(expected));
            expect(derived.descendants.map(e => e.value)).not.toContain('view-page');
            expect(derived.descendants.map(e => e.value)).not.toContain('view-sources');
        });

        it("admin — its format IS the site, so site-level verbs derive as ordinary descendants", () => {
            // admin's pattern-instance format is the shared `admin+pattern` one, so the site and
            // everything registered under it (pattern, tenant, theme, dmsenv) are its descendants.
            // No capabilities-vs-verbs distinction is needed: manage-themes/manage-tenants/
            // create-pattern/view-pattern-list govern theme, tenant and pattern rows, which are
            // exactly those registered formats.
            const derived = deriveAuthVocabulary({ self: PATTERN_ADMIN, formats: [siteFormat] });

            expect(shape(derived.self)).toEqual(shape([
                ...adminAuthVocabulary.self,
                { value: 'view-pattern', implies: ['read'] },        // the shared domain adds it
            ]));

            const values = derived.descendants.map(e => e.value);
            for (const v of adminAuthVocabulary.descendants.map(e => e.value)) {
                expect(values).toContain(v);                          // every shipped verb survives
            }
            expect(values).toContain('delete-pattern');               // decision 5: site, not pattern row
            expect(values).toContain('edit-pattern');                 // admin manages OTHER patterns
        });

        it("auth — the new user/group formats reproduce its auth-route verbs", async () => {
            const { default: authFormat } = await import("../src/patterns/auth/auth.format.js");
            const authAuthVocabulary = SHIPPED.auth;
            const derived = deriveAuthVocabulary({ self: PATTERN_ADMIN, formats: [authFormat] });
            const values = derived.descendants.map(e => e.value);
            for (const v of ['auth-users', 'auth-groups', 'view-as']) expect(values).toContain(v);
            // The SITE-level verbs on the shipped auth vocabulary (view-pattern-list,
            // create-pattern, manage-themes, manage-tenants) are there only because site access
            // falls back to the auth row while the admin row grants nothing
            // (utils/adminPermissions.js, `adminRowHasGrants`). They describe the SITE's row kinds,
            // not auth's, so they derive from the admin type and not from this one — the fallback
            // reads grants off the row and does not need the verb listed in auth's vocabulary.
            const siteLevel = ['view-pattern-list', 'create-pattern', 'manage-themes', 'manage-tenants'];
            expect(authAuthVocabulary.descendants.map(e => e.value)).toEqual(expect.arrayContaining(siteLevel));
            for (const v of siteLevel) expect(values).not.toContain(v);
        });

        it("mapeditor — reproduces its symbology verbs exactly", async () => {
            const { default: mapeditorFormat } = await import("../../../../patterns/mapeditor/mapeditor.format.js");
            const mapeditorAuthVocabulary = SHIPPED.mapeditor;
            const derived = deriveAuthVocabulary({ self: PATTERN_ADMIN, formats: [mapeditorFormat] });
            expect(shape(derived.descendants)).toEqual(shape(mapeditorAuthVocabulary.descendants));
        });

        it("qa and chat — minimal `settings`-only formats reproduce their verbs exactly", async () => {
            // A single `settings` attribute is enough to be a real format (owner, 2026-10-30); it
            // can be filled in later. Both patterns build their config from the page pattern's, so
            // their ticket/channel rows are page rows — the format exists to own the verb list.
            const cases = [
                ['qa', await import("../../../../patterns/qa/qa.format.js"), SHIPPED.qa],
                ['chat', await import("../../../../patterns/chat/chat.format.js"), SHIPPED.chat],
            ];
            for (const [name, fmt, oracle] of cases) {
                const derived = deriveAuthVocabulary({ self: PATTERN_ADMIN, formats: [fmt.default] });
                expect(shape(derived.descendants), name).toEqual(shape(oracle.descendants));
            }
        });

        it("delete-pattern is offered by admin and by no other type (decision 5)", async () => {
            const { default: cmsFormat } = await import("../src/patterns/page/page.format.js");
            const { default: datasetsFormat } = await import("../src/patterns/datasets/datasets.format.js");
            for (const formats of [[cmsFormat], [datasetsFormat]]) {
                const d = deriveAuthVocabulary({ self: PATTERN_ADMIN, formats });
                expect([...(d.self || []), ...(d.descendants || [])].map(e => e.value))
                    .not.toContain('delete-pattern');
            }
        });
    });
});
