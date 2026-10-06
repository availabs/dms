/**
 * kv_chips and comment_thread: read-only column types that show a text field's structure.
 *
 * Both read the JSON their QA fields are meant to hold and the plain " · "-joined text that
 * TransportNY's sitemgmt tickets hold today (samples below are the shapes found in
 * dms_npmrdsv5 sitemgmt_tickets on 2026-10-05).
 *
 * Run: npx vitest run packages/dms/tests/structuredTextColumns.test.jsx
 */

import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseKvChips, parseComments } from "../src/ui/columnTypes/structuredText.utils.js";
import { KvChipsView, KvChipsEdit } from "../src/ui/columnTypes/kv_chips.jsx";
import { CommentThreadView } from "../src/ui/columnTypes/comment_thread.jsx";
import ColumnTypes from "../src/ui/columnTypes";

const TNY_ENV = "1528×732 · Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const TNY_COMMENTS = "Investigated (agent, 2026-09-28): missing GiST index. · resolved (2026-09-28)";

describe("parseKvChips", () => {
    it("a JSON object → labelled chips, empty values dropped", () => {
        expect(parseKvChips('{"url":"/alphapage/page_1","browser":"Safari 18 · iOS","window":"390 × 844","x":""}')).toEqual([
            { label: "url", value: "/alphapage/page_1" },
            { label: "browser", value: "Safari 18 · iOS" },
            { label: "window", value: "390 × 844" },
        ]);
    });
    it("an object value (not text) and nested values", () => {
        expect(parseKvChips({ a: 1, b: { c: 2 } })).toEqual([{ label: "a", value: "1" }, { label: "b", value: '{"c":2}' }]);
    });
    it("a JSON array of pairs or strings", () => {
        expect(parseKvChips('[{"label":"os","value":"iOS"},"tablet"]')).toEqual([{ label: "os", value: "iOS" }, { label: "", value: "tablet" }]);
    });
    it("TransportNY plain text → unlabeled chips", () => {
        expect(parseKvChips(TNY_ENV).map(c => c.value)).toEqual(["1528×732", TNY_ENV.split(" · ")[1]]);
        expect(parseKvChips(TNY_ENV).every(c => c.label === "")).toBe(true);
    });
    it("broken JSON stays text; empty / null → none; wrapped values unwrap", () => {
        expect(parseKvChips("{oops")).toEqual([{ label: "", value: "{oops" }]);
        expect(parseKvChips("")).toEqual([]);
        expect(parseKvChips(null)).toEqual([]);
        expect(parseKvChips({ value: '{"a":"b"}', originalValue: '{"a":"b"}' })).toEqual([{ label: "a", value: "b" }]);
    });
});

describe("parseComments", () => {
    it("a JSON array of comments, with the alternate key names", () => {
        expect(parseComments(JSON.stringify([
            { author: "dev@example.com", date: "2026-09-24T15:10:00", text: "Reproduced at 390px." },
            { by: "client@example.com", at: "2026-09-24T15:45:00", body: "Tablet too." },
            { author: "x", text: "" },
        ]))).toEqual([
            { author: "dev@example.com", date: "2026-09-24T15:10:00", text: "Reproduced at 390px." },
            { author: "client@example.com", date: "2026-09-24T15:45:00", text: "Tablet too." },
        ]);
    });
    it("a single JSON object", () => {
        expect(parseComments('{"user":"a@b.c","message":"hi"}')).toEqual([{ author: "a@b.c", date: "", text: "hi" }]);
    });
    it("TransportNY plain text → text-only entries", () => {
        expect(parseComments(TNY_COMMENTS)).toEqual([
            { author: "", date: "", text: "Investigated (agent, 2026-09-28): missing GiST index." },
            { author: "", date: "", text: "resolved (2026-09-28)" },
        ]);
    });
    it("empty → none", () => {
        expect(parseComments(undefined)).toEqual([]);
        expect(parseComments("  ")).toEqual([]);
    });
});

describe("kv_chips render", () => {
    it("a labelled chip and an unlabeled chip, default classes", () => {
        const markup = renderToStaticMarkup(<KvChipsView value='[{"label":"url","value":"/p"},"tablet"]' />);
        expect(markup).toBe(
            '<span class="flex flex-wrap gap-1.5">' +
            '<span class="inline-flex items-center gap-1.5 rounded-md bg-[var(--t-well)] border border-[var(--t-rule)] px-2 py-0.5 t-metaSM normal-case tracking-normal text-[var(--t-graphite)]"><span class="text-[var(--t-pencil)]">url</span><span class="break-all">/p</span></span>' +
            '<span class="inline-flex items-center gap-1.5 rounded-md bg-[var(--t-well)] border border-[var(--t-rule)] px-2 py-0.5 t-metaSM normal-case tracking-normal text-[var(--t-graphite)]"><span class="break-all">tablet</span></span>' +
            '</span>'
        );
    });
    it("empty: nothing, or emptyText; edit mode = view", () => {
        expect(renderToStaticMarkup(<KvChipsView value="" />)).toBe("");
        expect(renderToStaticMarkup(<KvChipsView value="" emptyText="none" />)).toContain(">none</span>");
        expect(renderToStaticMarkup(<KvChipsEdit value='{"a":"b"}' />)).toBe(renderToStaticMarkup(<KvChipsView value='{"a":"b"}' />));
    });
});

describe("comment_thread render", () => {
    it("author initial, author, formatted date, text", () => {
        const markup = renderToStaticMarkup(<CommentThreadView value='[{"author":"dev@example.com","date":"2026-09-24T15:10:00","text":"Reproduced."}]' />);
        expect(markup).toContain('aria-hidden="true">d</span>');
        expect(markup).toContain(">dev@example.com</span>");
        expect(markup).toMatch(/>09\/24\/2026 3:10 pm<\/span>/);
        expect(markup).toContain(">Reproduced.</p>");
    });
    it("a text-only entry draws no avatar or meta line", () => {
        const markup = renderToStaticMarkup(<CommentThreadView value="just a note" />);
        expect(markup).not.toContain("aria-hidden");
        expect(markup).toContain(">just a note</p>");
    });
    it("an unparseable date shows as written", () => {
        expect(renderToStaticMarkup(<CommentThreadView value='[{"author":"a","date":"last week","text":"t"}]' />)).toContain(">last week</span>");
    });
});

describe("registered", () => {
    it("both types are in the column-type registry", () => {
        expect(ColumnTypes.kv_chips?.ViewComp).toBe(KvChipsView);
        expect(ColumnTypes.comment_thread?.ViewComp).toBe(CommentThreadView);
    });
});
