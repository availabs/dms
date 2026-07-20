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

import {
    isLayoutModelV2,
    resolveCardsPackMode,
    resolveCardsGridStyle,
    resolveCellTracks,
    resolveCellsGridStyle,
    resolveCellStyle,
    resolveHeaderValueWidths,
    resolveCellBorderClass,
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
