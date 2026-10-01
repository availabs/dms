/**
 * Unit tests for the dataWrapper save helpers: the keep-first setDateOnValue rule, the
 * changed-columns diff, whole-row date stamps, and the per-row pending live-edit saves
 * (one timer per row, merged fields, flush on unmount).
 *
 * Run: npx vitest run tests/liveEditSaves.test.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
    isDiscreteColumnType, rawValue, setDateOnValueStamp, changedColumns, dateStampsForRow, createPendingSaves,
} from "../src/patterns/page/components/sections/components/dataWrapper/utils/liveEditSaves.js";

const SDOV = { field: "resolved_date", values: ["Resolved", "Closed"] };
const NOW = new Date("2026-10-01T14:03:22.456Z");
const STAMP = "2026-10-01 14:03:22";

describe("setDateOnValueStamp", () => {
    it("writes nothing without the option", () => {
        expect(setDateOnValueStamp(undefined, "Triage", "Resolved", "", NOW)).toBeNull();
        expect(setDateOnValueStamp({ values: ["Resolved"] }, "Triage", "Resolved", "", NOW)).toBeNull();
    });
    it("stamps on entering a value", () => {
        expect(setDateOnValueStamp(SDOV, "Triage", "Resolved", "", NOW)).toEqual({ resolved_date: STAMP });
    });
    it("keeps the first date when moving between values", () => {
        expect(setDateOnValueStamp(SDOV, "Resolved", "Closed", "2026-09-01 10:00:00", NOW)).toBeNull();
    });
    it("stamps when moving between values with no date yet", () => {
        expect(setDateOnValueStamp(SDOV, "Resolved", "Closed", "", NOW)).toEqual({ resolved_date: STAMP });
    });
    it("clears the date on leaving the values", () => {
        expect(setDateOnValueStamp(SDOV, "Resolved", "In progress", "2026-09-01 10:00:00", NOW)).toEqual({ resolved_date: "" });
    });
    it("stamps when the old value is unknown", () => {
        expect(setDateOnValueStamp(SDOV, undefined, "Closed", undefined, NOW)).toEqual({ resolved_date: STAMP });
    });
});

describe("rawValue / isDiscreteColumnType", () => {
    it("unwraps formatted cells only", () => {
        expect(rawValue({ value: "1,000", originalValue: 1000 })).toBe(1000);
        expect(rawValue({ originalValue: "" })).toBe("");
        expect(rawValue("Triage")).toBe("Triage");
        expect(rawValue(["a"])).toEqual(["a"]);
    });
    it("names the pick-from-a-list types", () => {
        ["select", "multiselect", "radio", "checkbox", "boolean", "switch", "status_pill", "priority_tier"]
            .forEach(t => expect(isDiscreteColumnType(t)).toBe(true));
        ["text", "textarea", "lexical", "number", "date", undefined].forEach(t => expect(isDiscreteColumnType(t)).toBe(false));
    });
});

describe("changedColumns", () => {
    const columns = [{ name: "status", type: "status_pill" }, { name: "title", type: "text" }, { name: "tags", type: "multiselect" }];
    it("lists only columns the new row carries with a different value", () => {
        const old = { id: 1, status: "Triage", title: "A", tags: ["x"] };
        expect(changedColumns(columns, old, { id: 1, status: "Resolved", title: "A" }).map(c => c.name)).toEqual(["status"]);
        expect(changedColumns(columns, old, { id: 1, tags: ["x", "y"] }).map(c => c.name)).toEqual(["tags"]);
        expect(changedColumns(columns, old, { id: 1, status: "Triage", tags: ["x"] })).toEqual([]);
    });
    it("compares raw values and treats a missing old row as all-new", () => {
        expect(changedColumns(columns, { status: { originalValue: "Triage" } }, { status: "Triage" })).toEqual([]);
        expect(changedColumns(columns, undefined, { status: "Triage" }).map(c => c.name)).toEqual(["status"]);
        expect(changedColumns(columns, { status: "Triage" }, undefined)).toEqual([]);
    });
});

describe("dateStampsForRow", () => {
    const columns = [{ name: "status", setDateOnValue: SDOV }, { name: "title" }, { name: "resolved_date" }];
    it("stamps for a changed column with the option", () => {
        const old = { id: 1, status: "Triage", resolved_date: "" };
        expect(dateStampsForRow(columns, old, { ...old, status: "Resolved" }, NOW)).toEqual({ resolved_date: STAMP });
        expect(dateStampsForRow(columns, { ...old, status: "Resolved", resolved_date: STAMP }, { ...old, status: "Triage", resolved_date: STAMP }, NOW))
            .toEqual({ resolved_date: "" });
    });
    it("writes nothing when the status didn't change", () => {
        const old = { id: 1, status: "Resolved", title: "A", resolved_date: "2026-09-01 10:00:00" };
        expect(dateStampsForRow(columns, old, { ...old, title: "B" }, NOW)).toEqual({});
    });
    it("keeps the first date on Resolved → Closed", () => {
        const old = { id: 1, status: "Resolved", resolved_date: "2026-09-01 10:00:00" };
        expect(dateStampsForRow(columns, old, { ...old, status: "Closed" }, NOW)).toEqual({});
    });
    it("lets a date the save sets itself win", () => {
        const old = { id: 1, status: "Triage", resolved_date: "" };
        expect(dateStampsForRow(columns, old, { id: 1, status: "Resolved", resolved_date: "2026-08-01 09:00:00" }, NOW)).toEqual({});
    });
});

describe("createPendingSaves", () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    const setup = () => {
        const sent = [];
        const saves = createPendingSaves({ delay: 500, send: (data, format) => { sent.push({ data, format }); return Promise.resolve({ ok: data.id }); } });
        return { sent, saves };
    };

    it("saves edits to different rows separately (one never cancels the other)", async () => {
        const { sent, saves } = setup();
        saves.queue(1, { status: "Resolved" }, "fmt");
        await vi.advanceTimersByTimeAsync(200);
        saves.queue(2, { status: "Triage" }, "fmt");
        await vi.advanceTimersByTimeAsync(500);
        expect(sent).toEqual([
            { data: { id: 1, status: "Resolved" }, format: "fmt" },
            { data: { id: 2, status: "Triage" }, format: "fmt" },
        ]);
    });

    it("merges two fields edited on one row into one save", async () => {
        const { sent, saves } = setup();
        saves.queue(1, { status: "Resolved", resolved_date: "x" }, "fmt");
        await vi.advanceTimersByTimeAsync(200);
        saves.queue(1, { priority: "P1" }, "fmt");
        await vi.advanceTimersByTimeAsync(499);
        expect(sent).toEqual([]);
        await vi.advanceTimersByTimeAsync(1);
        expect(sent).toEqual([{ data: { id: 1, status: "Resolved", resolved_date: "x", priority: "P1" }, format: "fmt" }]);
    });

    it("keeps the last value of a field typed several times", async () => {
        const { sent, saves } = setup();
        saves.queue(1, { assignee: "R" }, "fmt");
        saves.queue(1, { assignee: "Ry" }, "fmt");
        saves.queue(1, { assignee: "Ryan" }, "fmt");
        await vi.advanceTimersByTimeAsync(500);
        expect(sent).toEqual([{ data: { id: 1, assignee: "Ryan" }, format: "fmt" }]);
    });

    it("resolves every merged edit's promise with the one save's result", async () => {
        const { saves } = setup();
        const a = saves.queue(1, { status: "Resolved" }, "fmt");
        const b = saves.queue(1, { priority: "P1" }, "fmt");
        await vi.advanceTimersByTimeAsync(500);
        await expect(a).resolves.toEqual({ ok: 1 });
        await expect(b).resolves.toEqual({ ok: 1 });
    });

    it("rejects the promise when the save fails", async () => {
        const saves = createPendingSaves({ delay: 500, send: () => Promise.reject(new Error("offline")) });
        const p = saves.queue(1, { status: "Resolved" }, "fmt");
        const check = expect(p).rejects.toThrow("offline");
        await vi.advanceTimersByTimeAsync(500);
        await check;
    });

    it("flushAll sends pending saves at once and leaves nothing to fire later", async () => {
        const { sent, saves } = setup();
        saves.queue(1, { status: "Resolved" }, "fmt");
        saves.queue(2, { status: "Closed" }, "fmt");
        expect(saves.size).toBe(2);
        saves.flushAll();
        expect(sent.map(s => s.data.id)).toEqual([1, 2]);
        expect(saves.size).toBe(0);
        await vi.advanceTimersByTimeAsync(1000);
        expect(sent).toHaveLength(2);
    });
});
