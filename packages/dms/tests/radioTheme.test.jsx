/**
 * The radio column type reads its look from theme.radio's named styles (radio.theme.js).
 *
 * Contract pinned here:
 *   - with no theme.radio (or styles[0] only), every class string is the one the type hard-coded
 *     before it was themable, and no marker / tag markup appears;
 *   - a named style picked by the column's `activeStyle` adds checked / done / upcoming classes,
 *     per-option markers (skipped on upcoming options), the done tick and the checked tag;
 *   - option ids are scoped per list, so two lists with the same option values don't share ids.
 *
 * Run: npx vitest run packages/dms/tests/radioTheme.test.jsx
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ThemeContext } from "../src/ui/useTheme";
import { RadioEdit, RadioView } from "../src/ui/columnTypes/radio.jsx";
import { radioTheme } from "../src/ui/columnTypes/radio.theme.js";

const STAGES = ["Proposed", "Design", "QA", "Client"];

const steps = {
    name: "steps",
    ordered: true,
    wrapper: "W",
    wrapperChecked: "W-CHECKED",
    wrapperDone: "W-DONE",
    wrapperUpcoming: "W-UP",
    label: "L",
    labelChecked: "L-CHECKED",
    marker: "M",
    markerChecked: "M-CHECKED",
    markerDone: "M-DONE",
    markerUpcoming: "M-UP",
    markers: { Proposed: "C-PROPOSED", Design: "C-DESIGN", QA: "C-QA", Client: "C-CLIENT" },
    doneTick: "TICK",
    tag: "TAG",
    viewAsList: true,
};
const chips = { name: "chips", marker: "M", markers: { Proposed: "C-PROPOSED", Client: "C-CLIENT" } };

const withTheme = (el, radio) =>
    radio ? <ThemeContext.Provider value={{ theme: { radio } }}>{el}</ThemeContext.Provider> : el;
const html = (el, radio) => renderToStaticMarkup(withTheme(el, radio));

// Parse without a DOM dependency: pull each option <label> and its pieces by regex.
const options = (markup) => [...markup.matchAll(/<label class="([^"]*)">(.*?)<\/label>/g)].map(([, cls, inner]) => ({
    cls,
    marker: (inner.match(/<span aria-hidden="true" class="([^"]*)"/) || [])[1],
    tick: inner.includes("<svg"),
    tag: (inner.match(/<span class="TAG">([^<]*)<\/span>/) || [])[1],
    id: (inner.match(/id="([^"]*)"/) || [])[1],
}));

describe("radio: default style is the pre-theme look", () => {
    it("emits the original class strings with no theme at all", () => {
        const markup = html(<RadioEdit value="Design" options={STAGES} onChange={() => {}} />);
        expect(markup.startsWith('<div class="flex flex-row">')).toBe(true);
        const opts = options(markup);
        expect(opts).toHaveLength(4);
        for (const o of opts) {
            expect(o.cls).toBe("p-1 flex");
            expect(o.marker).toBeUndefined();
            expect(o.tick).toBe(false);
        }
        expect(markup).toContain('class="self-center p-1"');
        expect(markup).toContain('<span class="text-sm font-light p-1 self-center"> Design </span>');
    });

    it("stacks vertically when inline is false", () => {
        expect(html(<RadioEdit value="" options={STAGES} inline={false} />)).toMatch(/^<div class="flex flex-col">/);
    });

    it("keeps the invalid-value note", () => {
        expect(html(<RadioEdit value="Nope" options={STAGES} />)).toContain('<div class="text-xs text-red-700 font-bold">Invalid Value: &quot;Nope&quot;</div>');
    });

    it("an unknown activeStyle falls back to the default", () => {
        const markup = html(<RadioEdit value="QA" options={STAGES} activeStyle="nope" />, radioTheme);
        expect(options(markup).every(o => o.cls === "p-1 flex")).toBe(true);
    });

    it("view mode is the bare value", () => {
        expect(html(<RadioView value="QA" options={STAGES} className="X" />)).toBe('<div class="X">QA</div>');
    });

    it("scopes ids per list", () => {
        const markup = html(<>
            <RadioEdit value="QA" options={STAGES} />
            <RadioEdit value="QA" options={STAGES} />
        </>);
        const ids = options(markup).map(o => o.id);
        expect(new Set(ids).size).toBe(8);
    });
});

describe("radio: a named style", () => {
    const theme = { options: { activeStyle: 0 }, styles: [...radioTheme.styles, steps, chips] };

    it("ordered: done / checked / upcoming, markers skip upcoming, tick on done, tag on checked", () => {
        const opts = options(html(<RadioEdit value="QA" options={STAGES} activeStyle="steps" checkedTag="current" />, theme));
        expect(opts.map(o => o.cls)).toEqual(["W W-DONE", "W W-DONE", "W W-CHECKED", "W W-UP"]);
        expect(opts.map(o => o.marker)).toEqual(["M M-DONE C-PROPOSED", "M M-DONE C-DESIGN", "M M-CHECKED C-QA", "M M-UP"]);
        expect(opts.map(o => o.tick)).toEqual([true, true, false, false]);
        expect(opts.map(o => o.tag)).toEqual([undefined, undefined, "current", undefined]);
    });

    it("ordered with nothing checked: no done / upcoming states", () => {
        const opts = options(html(<RadioEdit value="" options={STAGES} activeStyle="steps" />, theme));
        expect(opts.every(o => o.cls === "W")).toBe(true);
        expect(opts.map(o => o.marker)).toEqual(["M C-PROPOSED", "M C-DESIGN", "M C-QA", "M C-CLIENT"]);
    });

    it("unordered: every option keeps its marker, inheriting default keys", () => {
        const opts = options(html(<RadioEdit value="Design" options={STAGES} activeStyle="chips" />, theme));
        expect(opts.every(o => o.cls === "p-1 flex")).toBe(true);
        expect(opts.map(o => o.marker)).toEqual(["M C-PROPOSED", "M", "M", "M C-CLIENT"]);
    });

    it("viewAsList renders the list with disabled inputs", () => {
        const markup = html(<RadioView value="QA" options={STAGES} activeStyle="steps" />, theme);
        expect(options(markup)).toHaveLength(4);
        expect((markup.match(/disabled=""/g) || []).length).toBe(4);
    });
});
