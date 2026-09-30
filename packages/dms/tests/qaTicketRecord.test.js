/**
 * The `qa` pattern's ticket record (phase 2): fixed status kinds, default statuses and outcomes,
 * and the datasets an install owns. TransportNY's control-room columns must be carried over
 * exactly (its data gets copied in), with new columns only appended.
 *
 * See planning/tasks/current/qa-pattern-type.md.
 *
 * Run: npx vitest run packages/dms/tests/qaTicketRecord.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import { STATUS_KINDS, DEFAULT_STATUSES, OUTCOMES, statusKind } from "../src/patterns/qa/ticketRecord";
import { QA_DATASETS, qaDatasetSlug } from "../src/patterns/qa/datasets";
// TransportNY's sitemgmt_{tickets,pages,stories,patterns} source attributes, as stored 2026-09-30.
import SITEMGMT from "./fixtures/sitemgmtAttributes.json" with { type: "json" };

const dataset = (key) => QA_DATASETS.find((d) => d.key === key);
const values = (attr) => (attr.options || []).map((o) => o.value);
const byName = (attrs, name) => attrs.find((a) => a.name === name);

describe("ticket record", () => {
  it("maps every default status to a known kind", () => {
    DEFAULT_STATUSES.forEach((s) => expect(STATUS_KINDS).toContain(s.kind));
  });

  it("keeps TransportNY's seven statuses, in order", () => {
    expect(DEFAULT_STATUSES.map((s) => s.value)).toEqual(values(byName(SITEMGMT.tickets, "status")));
  });

  it("maps statuses to kinds", () => {
    expect(statusKind("Triage")).toBe("triage");
    expect(statusKind("In review")).toBe("active");
    expect(statusKind("Needs data")).toBe("waiting");
    expect(statusKind("Resolved")).toBe("done");
    expect(statusKind("Closed")).toBe("canceled");
    expect(statusKind("Nope")).toBeUndefined();
  });

  it("has the seven closed outcomes, including Feature request", () => {
    expect(OUTCOMES).toHaveLength(7);
    expect(OUTCOMES).toContain("Feature request");
  });
});

describe("datasets", () => {
  it("defines tickets, pages, stories, covered sub-sites and history", () => {
    expect(QA_DATASETS.map((d) => d.key)).toEqual(["tickets", "pages", "stories", "patterns", "history"]);
  });

  it.each(["pages", "stories", "patterns"])("keeps TransportNY's %s columns verbatim, then appends", (key) => {
    const attrs = dataset(key).attributes;
    expect(attrs.slice(0, SITEMGMT[key].length)).toEqual(SITEMGMT[key]);
    expect(attrs.slice(SITEMGMT[key].length).map((a) => a.name)).toEqual(["legacy_id"]);
  });

  it("keeps TransportNY's ticket columns in order, changing only status and severity options", () => {
    const attrs = dataset("tickets").attributes;
    const copied = attrs.slice(0, SITEMGMT.tickets.length);
    expect(copied.map((a) => a.name)).toEqual(SITEMGMT.tickets.map((a) => a.name));
    copied.forEach((a, i) => {
      if (a.name === "status" || a.name === "severity") return;
      expect(a).toEqual(SITEMGMT.tickets[i]);
    });
    expect(values(byName(attrs, "status"))).toEqual(DEFAULT_STATUSES.map((s) => s.value));
    expect(values(byName(attrs, "severity"))).toEqual([...values(byName(SITEMGMT.tickets, "severity")), "Feature"]);
    expect(attrs.slice(SITEMGMT.tickets.length).map((a) => a.name))
      .toEqual(["outcome", "reporter_name", "reporter_email", "legacy_id"]);
    expect(values(byName(attrs, "outcome"))).toEqual(OUTCOMES);
  });

  it("gives the history one row per field change", () => {
    expect(dataset("history").attributes.map((a) => a.name))
      .toEqual(["row_id", "field", "old_value", "new_value", "user_id", "user_email", "at", "via"]);
  });

  it("never repeats a column name within a dataset", () => {
    QA_DATASETS.forEach((d) => {
      const names = d.attributes.map((a) => a.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it("names an install's datasets <install>_<key>", () => {
    expect(qaDatasetSlug("qa", "tickets")).toBe("qa_tickets");
  });
});
