/**
 * stage_progress reads theme.stageProgress (stage_progress.theme.js).
 *
 * Contract pinned here:
 *   - the default style renders the original node bar byte-for-byte: the golden
 *     (fixtures/stageProgressDotsGolden.json) is the pre-theming component's output for the same
 *     cases, captured from HEAD on 2026-10-05;
 *   - a style with `variant: 'meter'` renders one segment per stage from theme classes, filled up to
 *     the current stage, with per-stage `segmentColors`, the label and the "n of m" count.
 *
 * Run: npx vitest run packages/dms/tests/stageProgressTheme.test.jsx
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ThemeContext } from "../src/ui/useTheme";
import { StageProgressView } from "../src/ui/columnTypes/stage_progress.jsx";
import { stageProgressTheme } from "../src/ui/columnTypes/stage_progress.theme.js";
import golden from "./fixtures/stageProgressDotsGolden.json";

const CASES = [
    { value: "QA" },
    { value: "Proposed", showLabel: false },
    { value: "" },
    { value: { value: "Design" }, stages: ["Proposed", "Design", "Done"], stageHex: { Design: "var(--x)" } },
];

const html = (props, stageProgress) => renderToStaticMarkup(
    stageProgress
        ? <ThemeContext.Provider value={{ theme: { stageProgress } }}><StageProgressView {...props} /></ThemeContext.Provider>
        : <StageProgressView {...props} />
);
const segments = (markup) => [...markup.matchAll(/<i title="([^"]*)" class="([^"]*)"><\/i>/g)].map(([, title, cls]) => ({ title, cls }));

describe("stage_progress: the default is the original node bar", () => {
    it("matches the pre-theming golden with no theme", () => {
        expect(CASES.map(c => html(c))).toEqual(golden);
    });
    it("matches it with the library theme registered and no style picked", () => {
        expect(CASES.map(c => html(c, stageProgressTheme))).toEqual(golden);
    });
    it("matches it when the picked style isn't a meter", () => {
        const theme = { ...stageProgressTheme, styles: [...stageProgressTheme.styles, { name: "other", segment: "X" }] };
        expect(CASES.map(c => html({ ...c, activeStyle: "other" }, theme))).toEqual(golden);
    });
});

describe("stage_progress: the meter variant", () => {
    const S = ["A", "B", "C", "D"];
    const ramp = {
        name: "ramp", variant: "meter", meter: "MTR", segments: "SEGS", segment: "SEG",
        segmentDone: "DONE", segmentUpcoming: "UP", segmentCurrent: "CUR",
        segmentColors: { A: "C-A", B: "C-B" }, label: "LBL", count: "CNT",
    };
    const theme = { ...stageProgressTheme, styles: [...stageProgressTheme.styles, ramp] };

    it("the library 'meter' style: accent fill up to the current stage, label and count", () => {
        const markup = html({ value: "C", stages: S, activeStyle: "meter" }, stageProgressTheme);
        const segs = segments(markup);
        expect(segs.map(s => s.title)).toEqual(S);
        expect(segs.map(s => s.cls)).toEqual([
            "block w-3 h-1.5 rounded-[1px] bg-[var(--t-cobalt)]",
            "block w-3 h-1.5 rounded-[1px] bg-[var(--t-cobalt)]",
            "block w-3 h-1.5 rounded-[1px] bg-[var(--t-cobalt)]",
            "block w-3 h-1.5 rounded-[1px] bg-[var(--t-rule)]",
        ]);
        expect(markup).toContain(">C</span>");
        expect(markup).toContain(">3 of 4</span>");
    });

    it("per-stage colours replace the done fill; current gets its extra class", () => {
        const segs = segments(html({ value: "C", stages: S, activeStyle: "ramp" }, theme));
        expect(segs.map(s => s.cls)).toEqual(["SEG C-A", "SEG C-B", "SEG DONE CUR", "SEG UP"]);
    });

    it("an unknown stage: all upcoming, the raw value as label, no count", () => {
        const markup = html({ value: "Z", stages: S, activeStyle: "ramp" }, theme);
        expect(segments(markup).every(s => s.cls === "SEG UP")).toBe(true);
        expect(markup).toContain('<span class="LBL">Z</span>');
        expect(markup).not.toContain("CNT");
    });

    it("showLabel:false hides label and count", () => {
        const markup = html({ value: "B", stages: S, activeStyle: "ramp", showLabel: false }, theme);
        expect(markup).not.toContain("LBL");
        expect(markup).not.toContain("CNT");
    });
});
