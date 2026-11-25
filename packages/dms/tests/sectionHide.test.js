/**
 * elementHidesSection (patterns/page/components/sections/section_utils.js): whether a section's own settings
 * hide it in view mode. Asked of every section by every band on each render, so it must not parse settings
 * it doesn't need to (planning/tasks/current/section-data-query-repeats.md).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { elementHidesSection } from "../src/patterns/page/components/sections/section_utils.js";

afterEach(() => vi.restoreAllMocks());

describe("elementHidesSection", () => {
  it("reads hideSection at the top level or under display, from a string or an object", () => {
    expect(elementHidesSection({ "element-data": JSON.stringify({ hideSection: true }) })).toBe(true);
    expect(elementHidesSection({ "element-data": JSON.stringify({ display: { hideSection: true } }) })).toBe(true);
    expect(elementHidesSection({ "element-data": { display: { hideSection: true } } })).toBe(true);
    expect(elementHidesSection({ "element-data": JSON.stringify({ display: { hideSection: false } }) })).toBe(false);
    expect(elementHidesSection({ "element-data": JSON.stringify({ data: [{ note: "hideSection" }] }) })).toBe(false);
  });

  it("is false for missing, empty or unparseable settings", () => {
    expect(elementHidesSection(undefined)).toBe(false);
    expect(elementHidesSection({})).toBe(false);
    expect(elementHidesSection({ "element-data": "" })).toBe(false);
    expect(elementHidesSection({ "element-data": "hideSection but not JSON" })).toBe(false);
  });

  it("does not parse settings that never mention it, and parses the others once per element", () => {
    const parse = vi.spyOn(JSON, "parse");
    const plain = { "element-data": '{"data":[{"a":1}]}' };
    elementHidesSection(plain);
    elementHidesSection(plain);
    expect(parse).not.toHaveBeenCalled();
    const hidden = { "element-data": '{"display":{"hideSection":true}}' };
    expect([elementHidesSection(hidden), elementHidesSection(hidden)]).toEqual([true, true]);
    expect(parse).toHaveBeenCalledTimes(1);
    // new settings on the same element are read again
    hidden["element-data"] = '{"display":{"hideSection":false}}';
    expect(elementHidesSection(hidden)).toBe(false);
  });
});
