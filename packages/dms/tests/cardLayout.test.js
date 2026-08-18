/**
 * Card box model — the explicit-zero contract and the four-knob model.
 *
 * A Card's rendered geometry must be derivable from its config by inspection:
 * explicit values — INCLUDING 0 — always win; nothing invisible adds or
 * absorbs space; undefined knobs emit NO style keys (an `undefined` longhand
 * listed after the `padding` shorthand drops the shorthand from the committed
 * CSSOM — the bug that made `cellsPadding: 0` silently lose to a theme class).
 *
 * See planning/tasks/current/card-layout-model-simplification.md.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
    isLayoutModelV2,
    resolveCardsPackMode,
    resolveCardsGridStyle,
    resolveCellTracks,
    resolveCellsGridStyle,
    resolveCellStyle,
    resolveCellFlexRow,
    resolveHeaderValueWidths,
    resolveCellBorderClass,
    resolveLinkAnchorStyle,
    describeResolvedPadding,
} from "../src/ui/components/Card.layout.js";

describe("explicit-zero contract (cell padding)", () => {
    it("cellsPadding: 0 emits padding: 0 (a value, never 'unset')", () => {
        const style = resolveCellStyle({ attr: {}, cellsPadding: 0 });
        expect(style.padding).toBe(0);
    });

    it("cellPadding: 0 on the column beats a non-zero section cellsPadding", () => {
        const style = resolveCellStyle({ attr: { cellPadding: 0 }, cellsPadding: 8 });
        expect(style.padding).toBe(0);
    });

    it("side-specific keys win over cellPadding (emitted after the shorthand)", () => {
        const style = resolveCellStyle({ attr: { cellPadding: 8, cellPaddingTop: 0 } });
        expect(style.padding).toBe(8);
        expect(style.paddingTop).toBe(0);
        const keys = Object.keys(style);
        expect(keys.indexOf("paddingTop")).toBeGreaterThan(keys.indexOf("padding"));
    });

    it("undefined knobs emit NO padding keys at all (v1 falls through to the theme class)", () => {
        const style = resolveCellStyle({ attr: {} });
        expect("padding" in style).toBe(false);
        expect("paddingTop" in style).toBe(false);
        expect("paddingRight" in style).toBe(false);
        expect("paddingBottom" in style).toBe(false);
        expect("paddingLeft" in style).toBe(false);
    });

    it("a cleared field ('') falls through to ambient; typed 0 does not", () => {
        expect(resolveCellStyle({ attr: { cellPadding: "" }, cellsPadding: 8 }).padding).toBe(8);
        expect(resolveCellStyle({ attr: { cellPadding: "0" }, cellsPadding: 8 }).padding).toBe(0);
    });

    it("never emits an 'undefinedpx' marginTop", () => {
        const style = resolveCellStyle({ attr: {} });
        expect("marginTop" in style).toBe(false);
    });

    it("fullBleed column types force 0 on every padding key", () => {
        const style = resolveCellStyle({ attr: { cellPadding: 12 }, hints: { fullBleed: true }, cellsPadding: 8 });
        expect(style.padding).toBe(0);
        expect(style.paddingTop).toBe(0);
    });
});

describe("v2 ambient gutter (cell padding always resolves inline)", () => {
    it("no knobs → theme cellGutter", () => {
        const style = resolveCellStyle({ attr: {}, layoutModelV2: true, cellGutter: 8 });
        expect(style.padding).toBe(8);
    });

    it("cellsPadding (including 0) beats the gutter", () => {
        expect(resolveCellStyle({ attr: {}, cellsPadding: 0, layoutModelV2: true, cellGutter: 8 }).padding).toBe(0);
        expect(resolveCellStyle({ attr: {}, cellsPadding: 4, layoutModelV2: true, cellGutter: 8 }).padding).toBe(4);
    });

    it("no gutter on the theme → 0, not undefined (v2 is always explicit)", () => {
        const style = resolveCellStyle({ attr: {}, layoutModelV2: true });
        expect(style.padding).toBe(0);
    });
});

describe("cards grid pack mode (vertical rhythm)", () => {
    it("v1 defaults to fill; 'top' opts into packing", () => {
        expect(resolveCardsPackMode({ layoutModelV2: false })).toBe("stretch");
        expect(resolveCardsPackMode({ cardsVerticalAlign: "top", layoutModelV2: false })).toBe("top");
        expect(resolveCardsPackMode({ cardsVerticalAlign: "stretch", layoutModelV2: false })).toBe("stretch");
    });

    it("v2 defaults to packed; 'stretch' opts back into fill", () => {
        expect(resolveCardsPackMode({ layoutModelV2: true })).toBe("top");
        expect(resolveCardsPackMode({ cardsVerticalAlign: "stretch", layoutModelV2: true })).toBe("stretch");
        expect(resolveCardsPackMode({ cardsVerticalAlign: "top", layoutModelV2: true })).toBe("top");
    });

    it("packed rows are content-sized (gap between cards is exactly cardsGridGap)", () => {
        const style = resolveCardsGridStyle({ display: { cardsGridGap: 16 }, layoutModelV2: true });
        expect(style.gridAutoRows).toBe("max-content");
        expect(style.alignContent).toBe("start");
        expect(style.gap).toBe(16);
    });

    it("fill rows distribute slack (legacy v1 default, unchanged)", () => {
        const style = resolveCardsGridStyle({ display: {}, layoutModelV2: false });
        expect(style.gridAutoRows).toBe("minmax(max-content, 1fr)");
        expect("alignContent" in style).toBe(false);
    });

    it("cardsGridPadding: 0 is emitted; unset emits nothing", () => {
        expect(resolveCardsGridStyle({ display: { cardsGridPadding: 0 } }).padding).toBe(0);
        expect("padding" in resolveCardsGridStyle({ display: {} })).toBe(false);
    });
});

describe("cells grid", () => {
    it("cellsRowGap/cellsColumnGap override one axis; unset falls through to gap", () => {
        const style = resolveCellsGridStyle({ display: { cellsGridGap: 8, cellsRowGap: 0 }, gridTemplateColumns: "1fr" });
        expect(style.gap).toBe(8);
        expect(style.rowGap).toBe(0);
        expect("columnGap" in style).toBe(false);
    });

    it("cellsRowHeight wins over the row-span auto rows", () => {
        const fixed = resolveCellsGridStyle({ display: { cellsRowHeight: 40 }, gridTemplateColumns: "1fr", hasRowSpan: true });
        expect(fixed.gridAutoRows).toBe("40px");
        const spanned = resolveCellsGridStyle({ display: {}, gridTemplateColumns: "1fr", hasRowSpan: true });
        expect(spanned.gridAutoRows).toBe("minmax(0, auto)");
    });

    // cellsVerticalAlign — the row-axis distribution of a fill-card's leftover
    // height. Unset MUST stay byte-identical (the BC case: rows pack to the top,
    // slack pools below the last one); 'stretch' spreads it across the rows.
    it("unset packs to the top and imposes no row sizing of its own", () => {
        const style = resolveCellsGridStyle({ display: {}, gridTemplateColumns: "1fr" });
        expect(style.alignContent).toBe("start");
        expect("gridAutoRows" in style).toBe(false);
    });

    it("'stretch' distributes the slack via align-content, NOT via flexible rows", () => {
        const style = resolveCellsGridStyle({ display: { cellsVerticalAlign: "stretch" }, gridTemplateColumns: "1fr" });
        expect(style.alignContent).toBe("stretch");
        // a `1fr` max sizing function EQUALIZES rows to the tallest row's
        // max-content instead of distributing free space — the old
        // implementation, which ballooned cards (395.8 → 751.3px measured).
        expect("gridAutoRows" in style).toBe(false);
    });

    // cellsRowsTemplate — Phase 2 of the slack-absorption task: "spread the
    // leftover, but NOT into THIS row". Peer of cellsTracksTemplate.
    it("cellsRowsTemplate is inert unless it is a non-empty string", () => {
        for (const v of [undefined, null, "", "   ", 0, 12, {}]) {
            expect("gridTemplateRows" in resolveCellsGridStyle({ display: { cellsRowsTemplate: v }, gridTemplateColumns: "1fr" }))
                .toBe(false);
        }
    });

    it("cellsRowsTemplate emits grid-template-rows verbatim", () => {
        expect(resolveCellsGridStyle({ display: { cellsRowsTemplate: "max-content" }, gridTemplateColumns: "1fr" }).gridTemplateRows)
            .toBe("max-content");
        expect(resolveCellsGridStyle({ display: { cellsRowsTemplate: "max-content max-content 1fr" }, gridTemplateColumns: "1fr" }).gridTemplateRows)
            .toBe("max-content max-content 1fr");
    });

    it("cellsRowsTemplate composes with 'stretch' — that pairing IS the recipe", () => {
        // 'max-content' pins row 1 (max sizing function = max-content, so §12.9
        // skips it); align-content:stretch then spreads the slack over the rest.
        const style = resolveCellsGridStyle({
            display: { cellsVerticalAlign: "stretch", cellsRowsTemplate: "max-content" },
            gridTemplateColumns: "1fr",
        });
        expect(style.alignContent).toBe("stretch");
        expect(style.gridTemplateRows).toBe("max-content");
        expect("gridAutoRows" in style).toBe(false);   // rows past row 1 stay implicit
    });

    it("cellsRowsTemplate governs EXPLICIT rows; cellsRowHeight/row-span still size the implicit ones", () => {
        const fixed = resolveCellsGridStyle({
            display: { cellsRowsTemplate: "max-content", cellsRowHeight: 40 }, gridTemplateColumns: "1fr",
        });
        expect(fixed.gridTemplateRows).toBe("max-content");
        expect(fixed.gridAutoRows).toBe("40px");
        const spanned = resolveCellsGridStyle({
            display: { cellsRowsTemplate: "max-content" }, gridTemplateColumns: "1fr", hasRowSpan: true,
        });
        expect(spanned.gridTemplateRows).toBe("max-content");
        expect(spanned.gridAutoRows).toBe("minmax(0, auto)");
    });

    it("'stretch' composes with row spans, and cellsRowHeight still wins the row size", () => {
        const spanned = resolveCellsGridStyle({ display: { cellsVerticalAlign: "stretch" }, gridTemplateColumns: "1fr", hasRowSpan: true });
        expect(spanned.gridAutoRows).toBe("minmax(0, auto)"); // auto max ⇒ takes its share
        expect(spanned.alignContent).toBe("stretch");
        const fixed = resolveCellsGridStyle({ display: { cellsVerticalAlign: "stretch", cellsRowHeight: 40 }, gridTemplateColumns: "1fr" });
        expect(fixed.gridAutoRows).toBe("40px"); // no auto-max track left to stretch
    });
});

// Two vertical axes, two keys. `cellVAlign` moves the CELL inside its grid row
// (align-self — which shrink-wraps it, so its borders leave the row's edge and a
// row's rules break into stubs); `cellContentVAlign` leaves the cell stretched and
// moves only the content inside it. An author can set both. See
// planning/tasks/completed/card-cell-content-valign.md.
describe("cell content v-align (fill the row AND place the content)", () => {
    it("unset emits NOTHING — byte-identical to before the knob existed (BC)", () => {
        for (const args of [
            { attr: {} },
            { attr: {}, display: {} },
            { attr: { cellContentVAlign: "" }, display: { cellsContentVAlign: "" } },
            { attr: {}, cellFlexRow: true },
            { attr: {}, cellFlexRow: false },
        ]) {
            const style = resolveCellStyle(args);
            expect("justifyContent" in style).toBe(false);
            expect("alignItems" in style).toBe(false);
        }
        // and the whole emitted object is unchanged by the new parameter
        const attr = { cellPadding: 8, cellSpan: 2, cellVAlign: "center" };
        expect(resolveCellStyle({ attr, cellFlexRow: true })).toEqual(resolveCellStyle({ attr }));
    });

    it("a COLUMN cell centres on the main axis (justify-content), never align-self", () => {
        const style = resolveCellStyle({ attr: {}, display: { cellsContentVAlign: "center" }, cellFlexRow: false });
        expect(style.justifyContent).toBe("center");
        expect("alignItems" in style).toBe(false);
        // the whole point: no align-self ⇒ the grid default `stretch` stands ⇒ the
        // cell still fills its row and cellBorderBottom draws on the row's edge.
        expect("alignSelf" in style).toBe(false);
    });

    it("a ROW cell centres on the cross axis (align-items), never align-self", () => {
        const style = resolveCellStyle({ attr: {}, display: { cellsContentVAlign: "center" }, cellFlexRow: true });
        expect(style.alignItems).toBe("center");
        expect("justifyContent" in style).toBe(false);
        expect("alignSelf" in style).toBe(false);
    });

    it("top | center | bottom all ship, in both directions", () => {
        const flex = { top: "flex-start", center: "center", bottom: "flex-end" };
        for (const [v, css] of Object.entries(flex)) {
            expect(resolveCellStyle({ attr: { cellContentVAlign: v }, cellFlexRow: false }).justifyContent).toBe(css);
            expect(resolveCellStyle({ attr: { cellContentVAlign: v }, cellFlexRow: true }).alignItems).toBe(css);
        }
    });

    it("per-column wins over the section default", () => {
        expect(resolveCellStyle({
            attr: { cellContentVAlign: "bottom" }, display: { cellsContentVAlign: "center" }, cellFlexRow: false,
        }).justifyContent).toBe("flex-end");
    });

    it("composes with cellVAlign — different axes, both emitted", () => {
        const style = resolveCellStyle({
            attr: { cellVAlign: "bottom", cellContentVAlign: "center" }, cellFlexRow: false,
        });
        expect(style.alignSelf).toBe("end");
        expect(style.justifyContent).toBe("center");
    });

    it("an unrecognized value passes through verbatim (same escape hatch as cellVAlign)", () => {
        expect(resolveCellStyle({ attr: { cellContentVAlign: "space-between" }, cellFlexRow: false }).justifyContent)
            .toBe("space-between");
    });
});

// WHICH property is vertical depends on the direction the cell wrapper actually
// renders in — not on Card.jsx's `isRowLayout` (that treats unset as row for the
// header/value width split). Getting it wrong is not inert: on transportnyv2's
// flex-col cells, `align-items: center` left the content top-anchored AND
// shrink-wrapped it horizontally (42 → 29px, measured on NPMRDS Home § 01).
describe("cell flex direction (which axis is vertical)", () => {
    it("an explicit headerValueLayout names the direction", () => {
        expect(resolveCellFlexRow({ headerValueLayout: "row", headerValueWrapper: "flex flex-col w-full" })).toBe(true);
        expect(resolveCellFlexRow({ headerValueLayout: "col", headerValueWrapper: "w-full flex items-center" })).toBe(false);
    });

    it("unset falls back to the direction the theme's headerValueWrapper bakes", () => {
        // transportnyv2 / tessera — stacked
        expect(resolveCellFlexRow({ headerValueWrapper: "flex flex-col w-full" })).toBe(false);
        expect(resolveCellFlexRow({ headerValueWrapper: "flex flex-col gap-1 px-1 py-1" })).toBe(false);
        // dms default / avail / wcdb / mny — a bare `flex` is a ROW
        expect(resolveCellFlexRow({ headerValueWrapper: "w-full rounded-[12px] flex items-center justify-center p-2" })).toBe(true);
        expect(resolveCellFlexRow({ headerValueWrapper: "" })).toBe(true);
        expect(resolveCellFlexRow({})).toBe(true);
    });

    it("reverse variants keep their axis; `!` importance still counts", () => {
        expect(resolveCellFlexRow({ headerValueWrapper: "flex flex-col-reverse" })).toBe(false);
        expect(resolveCellFlexRow({ headerValueWrapper: "flex flex-col!" })).toBe(false);
        expect(resolveCellFlexRow({ headerValueWrapper: "flex !flex-col" })).toBe(false);
        expect(resolveCellFlexRow({ headerValueWrapper: "flex flex-row-reverse" })).toBe(true);
    });

    it("does not mistake a hyphenated or variant-prefixed utility for the direction", () => {
        expect(resolveCellFlexRow({ headerValueWrapper: "flex flex-collapse-x" })).toBe(true);
        expect(resolveCellFlexRow({ headerValueWrapper: "flex md:flex-col" })).toBe(true);
    });
});

describe("track walker (cellWidth first-wins)", () => {
    it("cellsTracksTemplate wins outright", () => {
        expect(resolveCellTracks({ cellsTracksTemplate: "64px 1fr", visibleColumns: [{ cellWidth: "10px" }] }))
            .toBe("64px 1fr");
    });

    it("first column to land on a track imposes its width", () => {
        expect(resolveCellTracks({
            cellsGridSize: 3,
            visibleColumns: [{ cellWidth: "64px" }, {}, { cellWidth: "52px" }],
        })).toBe("64px minmax(0, 1fr) 52px");
    });

    it("cellSpan > 1 with cellWidth collapses the extra unclaimed tracks to 0px", () => {
        expect(resolveCellTracks({
            cellsGridSize: 3,
            visibleColumns: [{ cellWidth: "96px", cellSpan: 2 }, {}],
        })).toBe("96px 0px minmax(0, 1fr)");
    });
});

describe("row-layout width split (no hidden reservation)", () => {
    it("both visible → the configured (default 50/50) split", () => {
        expect(resolveHeaderValueWidths({ isRowLayout: true }))
            .toEqual({ headerMaxWidth: "50%", valueMaxWidth: "50%" });
        expect(resolveHeaderValueWidths({ isRowLayout: true, headerWidth: 30, valueWidth: 70 }))
            .toEqual({ headerMaxWidth: "30%", valueMaxWidth: "70%" });
    });

    it("hideHeader → the value gets the full cell (no 50% reservation)", () => {
        expect(resolveHeaderValueWidths({ isRowLayout: true, hideHeader: true }))
            .toEqual({ headerMaxWidth: undefined, valueMaxWidth: undefined });
    });

    it("hideValue → the header gets the full cell", () => {
        expect(resolveHeaderValueWidths({ isRowLayout: true, hideValue: true }))
            .toEqual({ headerMaxWidth: undefined, valueMaxWidth: undefined });
    });

    it("col layout → no split at all", () => {
        expect(resolveHeaderValueWidths({ isRowLayout: false }))
            .toEqual({ headerMaxWidth: undefined, valueMaxWidth: undefined });
    });
});

describe("cell chrome (border vs outline)", () => {
    it("v1 keeps the layout-stabilizing transparent border fallback", () => {
        expect(resolveCellBorderClass({})).toBe("border border-transparent");
        expect(resolveCellBorderClass({ sidedBorder: "border-b" })).toBe("");
    });

    it("v2 has NO +2px constant: no chrome by default, outline on edit hover", () => {
        expect(resolveCellBorderClass({ layoutModelV2: true })).toBe("");
        expect(resolveCellBorderClass({ layoutModelV2: true, editHover: true }))
            .toBe("outline outline-blue-300 -outline-offset-1");
    });

    it("v2 edit hover layers on author chrome instead of replacing it (no geometry shift)", () => {
        const theme = { itemBorder: "border shadow" };
        expect(resolveCellBorderClass({ layoutModelV2: true, editHover: true, cellBorder: true, theme }))
            .toBe("border shadow outline outline-blue-300 -outline-offset-1");
    });
});

// A link cell puts its token on the INLINE <a>/<Link>, where `line-height` can't
// size the line box (the value div's strut does). Blockifying the anchor hands the
// line box back to the token — but ONLY when the token has no display of its own,
// because that display is what makes a box token a box (and what makes a clamp
// clamp). See planning/tasks/current/card-link-cell-line-height.md.
describe("link anchor (token leading vs. the value div's strut)", () => {
    it("a plain text token gets display:block so its own leading sizes the line box", () => {
        expect(resolveLinkAnchorStyle("font-proxima text-[12.5px]! leading-[1.55]! text-slate-500!"))
            .toEqual({ display: "block" });
        // no leading declared: still blockified, because an inherited UNITLESS
        // line-height resolves against the token's own font-size (9px × 1.5 = 13.5,
        // not the div's 16px × 1.5 = 24) — which is what a non-link cell does.
        expect(resolveLinkAnchorStyle("font-mono text-[9px]! uppercase tracking-[0.18em]"))
            .toEqual({ display: "block" });
    });

    it("a BOX token keeps its own display — no double box, no flattened button", () => {
        // btnPrimary / btnOutline / toggleOff / linkMonoXS (transportnyv2)
        expect(resolveLinkAnchorStyle("inline-flex items-center w-fit h-9 px-3.5! bg-[#1F3F8F] rounded-[6px]")).toBeUndefined();
        // MNY's linkColValue — the no-token fallback is itself a flex pill
        expect(resolveLinkAnchorStyle("flex-1 flex justify-center w-full bg-[#C5D7E0] rounded-full leading-[100%]")).toBeUndefined();
        expect(resolveLinkAnchorStyle("inline-block px-2")).toBeUndefined();
        expect(resolveLinkAnchorStyle("grid")).toBeUndefined();
        expect(resolveLinkAnchorStyle("inline")).toBeUndefined();
        expect(resolveLinkAnchorStyle("hidden")).toBeUndefined();
    });

    it("line-clamp IS a display utility (it sets -webkit-box) and is left alone", () => {
        expect(resolveLinkAnchorStyle("font-proxima text-[11.5px]! leading-[1.5]! line-clamp-2")).toBeUndefined();
        expect(resolveLinkAnchorStyle("text-[12.5px]! leading-[1.55]! line-clamp-1 break-all")).toBeUndefined();
    });

    it("variant prefixes, `!` on either side, and [display:…] all count as declared", () => {
        expect(resolveLinkAnchorStyle("text-sm sm:flex")).toBeUndefined();
        expect(resolveLinkAnchorStyle("md:inline-block text-xs")).toBeUndefined();
        expect(resolveLinkAnchorStyle("!flex")).toBeUndefined();
        expect(resolveLinkAnchorStyle("flex!")).toBeUndefined();
        expect(resolveLinkAnchorStyle("[display:ruby]")).toBeUndefined();
    });

    it("does NOT mistake a hyphenated utility for a display utility", () => {
        // flex-1 / table-auto / inline-* colours must not switch the guard on
        expect(resolveLinkAnchorStyle("flex-1 text-[13px]")).toEqual({ display: "block" });
        expect(resolveLinkAnchorStyle("table-auto text-[13px]")).toEqual({ display: "block" });
        expect(resolveLinkAnchorStyle("grid-cols-2 text-[13px]")).toEqual({ display: "block" });
    });

    it("no token at all (theme.linkColValue empty) still blockifies harmlessly", () => {
        // nothing declares a font-size, so the anchor inherits exactly what the
        // strut gave it — measured byte-identical on the control-room ticket page.
        expect(resolveLinkAnchorStyle("")).toEqual({ display: "block" });
        expect(resolveLinkAnchorStyle(undefined)).toEqual({ display: "block" });
        expect(resolveLinkAnchorStyle("text-blue-600 underline")).toEqual({ display: "block" });
    });
});

// Card.jsx does NOT hand `display` to resolveCellsGridStyle wholesale — it
// re-assembles a curated object literal. So a resolver that starts reading a new
// display key gets `undefined` forever and the knob silently does nothing, with
// the data written correctly and the DOM ignoring it. That is exactly how
// `cellsRowsTemplate` shipped inert on its first build (2026-08-14); this test is
// the guard, because no value-level unit test can see it.
describe("Card.jsx forwards every display key the cells-grid resolver reads", () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const read = p => fs.readFileSync(path.join(here, p), "utf8");

    const split = block => block.split(",").map(s => s.split(":")[0].trim()).filter(Boolean);

    it("the curated literal covers the resolver's destructure", () => {
        // Card.layout.js — the `const { … } = display;` the resolver reads.
        const layout = read("../src/ui/components/Card.layout.js");
        const fnAt = layout.indexOf("export function resolveCellsGridStyle");
        expect(fnAt, "resolveCellsGridStyle not found").toBeGreaterThan(-1);
        const endAt = layout.indexOf("} = display;", fnAt);
        const wanted = split(layout.slice(layout.lastIndexOf("{", endAt) + 1, endAt));

        // Card.jsx — the `display: { … }` literal it hands to the resolver.
        const card = read("../src/ui/components/Card.jsx");
        const callAt = card.indexOf("resolveCellsGridStyle({");
        expect(callAt, "resolveCellsGridStyle call not found").toBeGreaterThan(-1);
        const dispAt = card.indexOf("display: {", callAt);
        const forwarded = split(card.slice(dispAt + "display: {".length, card.indexOf("}", dispAt)));
        expect(wanted.length).toBeGreaterThan(5);
        expect(forwarded).toEqual(expect.arrayContaining(wanted));
    });

    // The CELL resolver escapes that trap only because it gets the display object
    // WHOLE (`display,`), which is how `display.cellsContentVAlign` / `cellsVAlign`
    // reach it. Curate that call site into an object literal and every section-level
    // cell key silently dies — same failure mode, no error. Guard it too.
    it("resolveCellStyle receives the display object whole, not a curated literal", () => {
        const card = read("../src/ui/components/Card.jsx");
        const callAt = card.indexOf("resolveCellStyle({");
        expect(callAt, "resolveCellStyle call not found").toBeGreaterThan(-1);
        const args = card.slice(callAt, card.indexOf("})", callAt));
        expect(args).toMatch(/(^|[{,\s])display\s*[,}]/);
    });
});

describe("introspection helpers", () => {
    it("isLayoutModelV2 reads the resolved theme style", () => {
        expect(isLayoutModelV2({ layoutModel: "v2" })).toBe(true);
        expect(isLayoutModelV2({})).toBe(false);
        expect(isLayoutModelV2(undefined)).toBe(false);
    });

    it("describeResolvedPadding names the source of every emitted pad", () => {
        expect(describeResolvedPadding(resolveCellStyle({ attr: {} }))).toBe("theme");
        expect(describeResolvedPadding(resolveCellStyle({ attr: {}, cellsPadding: 0 }))).toBe("0");
        expect(describeResolvedPadding(resolveCellStyle({ attr: { cellPadding: 8, cellPaddingTop: 0 } })))
            .toBe("8 t:0");
    });
});
