/**
 * A dataset's change-history setting (patterns/datasets/utils/changeHistory.js): the Admin tab
 * panel's choices ⇄ the stored `change_history`, switching off without losing the target, what
 * blocks a save, and which datasets count as a history. The server side (writing the rows) is
 * tested in dms-server tests/test-change-history.js.
 *
 * Run: npx vitest run packages/dms/tests/changeHistorySetting.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import {
  CHANGE_HISTORY_COLUMNS, changeHistoryDraft, changeHistoryProblem, changeHistorySetting, historyDatasetName, isHistoryShaped,
} from "../src/patterns/datasets/utils/changeHistory";

const config = (names) => JSON.stringify({ attributes: names.map((name) => ({ name })) });
const target = { source_id: 135, view_id: 136 };

describe("change history setting", () => {
  it("round-trips a column list and an all-columns setting", () => {
    const listed = { target, columns: ["status", "assignee"] };
    expect(changeHistorySetting(changeHistoryDraft(listed), target)).toEqual(listed);
    const all = { target, columns: "*", exclude: ["updated"] };
    expect(changeHistorySetting(changeHistoryDraft(all), target)).toEqual(all);
    // stored as a JSON string reads the same
    expect(changeHistoryDraft(JSON.stringify(listed))).toEqual(changeHistoryDraft(listed));
  });

  it("switching off keeps the target and columns, so switching back on writes to the same history", () => {
    const on = { target, columns: ["status"] };
    const off = changeHistorySetting({ ...changeHistoryDraft(on), enabled: false }, target);
    expect(off).toEqual({ target, columns: ["status"], enabled: false });
    expect(changeHistoryDraft(off)).toEqual({ ...changeHistoryDraft(on), enabled: false });
    expect(changeHistorySetting({ ...changeHistoryDraft(off), enabled: true }, target)).toEqual(on);
  });

  it("has nothing to store without a target (never switched on)", () => {
    expect(changeHistoryDraft(null)).toEqual({ enabled: false, allColumns: false, columns: [], exclude: [] });
    expect(changeHistorySetting({ enabled: true, columns: ["a"] }, null)).toBeNull();
  });

  it("drops an empty except list, and won't save a column list with no columns", () => {
    expect(changeHistorySetting({ enabled: true, allColumns: true, exclude: [] }, target)).toEqual({ target, columns: "*" });
    expect(changeHistoryProblem({ enabled: true, allColumns: false, columns: [] })).toMatch(/column/);
    expect(changeHistoryProblem({ enabled: true, allColumns: true, columns: [] })).toBe("");
    expect(changeHistoryProblem({ enabled: false, columns: [] })).toBe("");
  });

  it("names a dataset's own history, and recognises a history by its columns", () => {
    expect(historyDatasetName("Traffic counts")).toBe("Traffic counts history");
    expect(isHistoryShaped({ config: JSON.stringify({ attributes: CHANGE_HISTORY_COLUMNS }) })).toBe(true);
    expect(isHistoryShaped({ config: config(["row_id", "field", "old_value", "new_value"]) })).toBe(true);
    expect(isHistoryShaped({ config: config(["row_id", "field", "old_value"]) })).toBe(false);
    expect(isHistoryShaped({})).toBe(false);
  });

  it("names the columns the server writes", () => {
    expect(CHANGE_HISTORY_COLUMNS.map((c) => c.name))
      .toEqual(["row_id", "source_id", "field", "old_value", "new_value", "user_id", "user_email", "at", "via"]);
  });
});
