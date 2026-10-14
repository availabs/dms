/**
 * A `qa` install's own ticket fields (patterns/qa/fields.js): stored on the install row as
 * `qa.fields`, each a column of the tickets dataset, shown where the install says (the report forms,
 * the Ticket page's Details, the Tickets table, the filter bar).
 *
 * See planning/tasks/current/qa-pattern-type.md, §5 step 2a.
 *
 * Run: npx vitest run packages/dms/tests/qaFields.test.js --root src/dms
 */

import { describe, it, expect } from "vitest";
import {
  fieldName, installFields, fieldsShownIn, fieldColumn, parseOptions, fieldValuesInUse, fieldErrors,
  describeFieldEdits, planFieldColumns, settledFields, withType, newField, RESERVED_NAMES,
} from "../src/patterns/qa/fields";
import { buildQaPages } from "../src/patterns/qa/pages";
import { intakeFields, missingRequired, reportRow } from "../src/patterns/qa/reportIssue/report";
import { writeQaFieldColumns } from "../src/patterns/qa/install";

const CHANNEL = { name: "channel", label: "Channel", type: "pick_one", options: ["phone", "email", "office hours"], show: { form: true, details: true, table: true, filter: true }, required: true };
const HOURS = { name: "hours", label: "Hours", type: "number", options: [], show: { form: false, details: true, table: true, filter: false }, required: false };
const RECEIVED = { name: "received", label: "Received", type: "date", options: [], show: { form: true, details: true, table: true, filter: false }, required: false };
const NOTES = { name: "notes", label: "Notes", type: "long_text", options: [], show: { form: false, details: true, table: false, filter: false }, required: false };
const REQUESTER = { name: "requester", label: "Requester", type: "text", options: [], show: { form: false, details: false, table: false, filter: true }, required: false };

describe("the field model", () => {
  it("names a field from its label: lowercase, underscores, starting with a letter", () => {
    expect(fieldName("Requester type")).toBe("requester_type");
    expect(fieldName("  Hours (spent) ")).toBe("hours_spent");
    expect(fieldName("2nd contact")).toBe("nd_contact");
    expect(fieldName("—")).toBe("");
  });

  it("reads the stored fields filled out, leaving out an unnamed or unknown one", () => {
    const got = installFields({ qa: { fields: [
      { name: "channel", label: "Channel", type: "pick_one", options: ["a"], show: { form: true, filter: true }, required: true },
      { name: "hours", type: "number", options: ["x"], show: { filter: true }, required: true },
      { name: "", label: "No name", type: "text" },
      { name: "odd", label: "Odd", type: "colour" },
    ] } });
    expect(got.map((f) => f.name)).toEqual(["channel", "hours"]);
    expect(got[1]).toEqual({ name: "hours", label: "hours", type: "number", options: [], show: { form: false, details: false, table: false, filter: false }, required: false });
    expect(got[0].show.filter).toBe(true);
    expect(installFields({})).toEqual([]);
  });

  it("makes each field a column of the tickets dataset", () => {
    expect(fieldColumn(CHANNEL)).toEqual({
      name: "channel", display_name: "Channel", type: "select", required: false,
      options: [{ label: "phone", value: "phone" }, { label: "email", value: "email" }, { label: "office hours", value: "office hours" }],
    });
    expect(fieldColumn(HOURS).type).toBe("number");
    expect(fieldColumn(RECEIVED).type).toBe("date");
    expect(fieldColumn(NOTES).type).toBe("textarea");
  });

  it("parses an options line: trimmed, no blanks, no repeats", () => {
    expect(parseOptions(" phone, email,, phone ,office hours, ")).toEqual(["phone", "email", "office hours"]);
  });

  it("knows the values tickets hold for each field", () => {
    const used = fieldValuesInUse([{ channel: "phone" }, { channel: "" }, { channel: "phone", hours: 3 }, {}], [CHANNEL, HOURS]);
    expect([...used.channel]).toEqual(["phone"]);
    expect([...used.hours]).toEqual(["3"]);
  });

  it("settles rows for a save: names from labels, the typed line dropped; a saved name stays", () => {
    expect(settledFields([{ ...newField(), label: "Requester type", _optionsText: "a," }, { ...CHANNEL, label: "How it came in" }]).map((f) => [f.name, "_optionsText" in f]))
      .toEqual([["requester_type", false], ["channel", false]]);
  });

  it("drops a pick list's options and an unfilterable filter when the type changes", () => {
    expect(withType(CHANNEL, "long_text")).toMatchObject({ type: "long_text", options: [], show: { filter: false } });
    expect(withType(REQUESTER, "pick_one").show.filter).toBe(true);
  });
});

describe("field errors", () => {
  const errs = (fields, opts) => fieldErrors(fields, opts);

  it("needs a label that makes a name", () => {
    expect(errs([{ ...newField(), name: "" }])[0]).toMatch(/label/);
    expect(errs([{ ...newField(), label: "—", name: "" }])[0]).toMatch(/letter/);
  });

  it("won't take a ticket column's name, or a name another field has", () => {
    expect(RESERVED_NAMES.has("status")).toBe(true);
    expect(errs([{ ...newField(), label: "Status", name: "status" }])[0]).toMatch(/already a ticket column/);
    expect(errs([CHANNEL, { ...HOURS, name: "channel" }])[1]).toMatch(/already named/);
  });

  it("needs options on a pick list", () => {
    expect(errs([{ ...CHANNEL, options: [] }])[0]).toMatch(/at least one option/);
  });

  it("keeps a saved field's type, and the options tickets use, while tickets hold values", () => {
    const inUse = { channel: new Set(["phone"]) };
    expect(errs([{ ...CHANNEL, type: "text", options: [] }], { saved: [CHANNEL], inUse })[0]).toMatch(/type stays pick one/);
    expect(errs([{ ...CHANNEL, options: ["email"] }], { saved: [CHANNEL], inUse })[0]).toMatch(/"phone"/);
    expect(errs([CHANNEL], { saved: [CHANNEL], inUse })[0]).toBe("");
    // with no values held, a saved field can change type
    expect(errs([{ ...CHANNEL, type: "text", options: [] }], { saved: [CHANNEL], inUse: { channel: new Set() } })[0]).toBe("");
  });
});

describe("the save bar's words for field changes", () => {
  it("names each change", () => {
    expect(describeFieldEdits([CHANNEL, HOURS], [CHANNEL])).toEqual(["Hours added"]);
    expect(describeFieldEdits([{ ...CHANNEL, label: "Via" }], [CHANNEL])).toEqual(["Channel's label"]);
    expect(describeFieldEdits([{ ...CHANNEL, options: ["phone"] }], [CHANNEL])).toEqual(["Channel's options"]);
    expect(describeFieldEdits([{ ...CHANNEL, show: { ...CHANNEL.show, table: false } }], [CHANNEL])).toEqual(["where Channel shows"]);
    expect(describeFieldEdits([HOURS], [CHANNEL, HOURS])).toEqual(["Channel removed"]);
    expect(describeFieldEdits([HOURS, CHANNEL], [CHANNEL, HOURS])).toEqual(["the field order"]);
    expect(describeFieldEdits([CHANNEL], [CHANNEL])).toEqual([]);
  });
});

describe("the tickets dataset's columns", () => {
  const source = {
    config: JSON.stringify({ attributes: [{ name: "status", display_name: "Status", type: "select" }, { name: "hours", display_name: "Old hours", type: "text" }] }),
    change_history: { target: { source_id: 9, view_id: 10 }, columns: ["status"] },
  };

  it("adds each new field's column, brings an existing one up to date, and tracks them in the history", () => {
    const edit = planFieldColumns({ fields: [CHANNEL, HOURS], source });
    const attrs = JSON.parse(edit.config).attributes;
    expect(attrs.map((a) => a.name)).toEqual(["status", "hours", "channel"]);
    expect(attrs.find((a) => a.name === "hours")).toMatchObject({ display_name: "Hours", type: "number" });
    expect(edit.change_history).toEqual({ target: { source_id: 9, view_id: 10 }, columns: ["status", "channel", "hours"] });
  });

  it("never touches a ticket record column, and has nothing to do once up to date", () => {
    const edit = planFieldColumns({ fields: [{ ...HOURS }], source });
    const settledSource = { config: edit.config, change_history: edit.change_history };
    expect(planFieldColumns({ fields: [HOURS], source: settledSource })).toBeNull();
    expect(JSON.parse(edit.config).attributes[0]).toEqual({ name: "status", display_name: "Status", type: "select" });
  });

  it("leaves a history that tracks every column, or none, as it is", () => {
    const all = planFieldColumns({ fields: [CHANNEL], source: { ...source, change_history: { columns: "*" } } });
    expect(all.change_history).toBeUndefined();
    const off = planFieldColumns({ fields: [CHANNEL], source: { config: source.config } });
    expect(off.change_history).toBeUndefined();
  });

  it("writes the plan to the tickets source, read fresh", async () => {
    const calls = [];
    const falcor = {
      invalidate: async () => {},
      get: async (path) => ({ json: { dms: { data: { [path[2]]: { byId: { [path[4]]: { id: path[4], type: "env|t:source", data: source } } } } } } }),
      call: async (path, args) => { calls.push(args); return {}; },
    };
    expect(await writeQaFieldColumns({ falcor, app: "qa_test", datasets: { tickets: { slug: "t", source_id: 220, view_id: 221 } }, fields: [CHANNEL] })).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe(220);
    expect(JSON.parse(calls[0][2].config).attributes.map((a) => a.name)).toContain("channel");
    expect(await writeQaFieldColumns({ falcor, app: "qa_test", datasets: {}, fields: [CHANNEL] })).toBe(false);
  });
});

// ── where the fields land ──

const datasets = {
  tickets: { slug: "f_tickets", source_id: 43, view_id: 44 },
  pages: { slug: "f_pages", source_id: 45, view_id: 46 },
  stories: { slug: "f_stories", source_id: 47, view_id: 48 },
  patterns: { slug: "f_patterns", source_id: 49, view_id: 50 },
  history: { slug: "f_history", source_id: 51, view_id: 52 },
};
const FIELDS = [CHANNEL, HOURS, RECEIVED, NOTES, REQUESTER];
const install = (fields = FIELDS) => ({ name: "F", qa: { version: 1, datasets, fields } });
const ctx = { app: "qa_test", baseUrl: "/f", sites: [] };
const pageBy = (slug, p = install()) => buildQaPages(p, ctx).find((x) => x.url_slug === slug);
const sectionById = (page, id) => page.sections.find((s) => s.trackingId === id);
const dataOf = (s) => JSON.parse(s.element["element-data"]);

describe("the Ticket page's Details", () => {
  const rail = dataOf(sectionById(pageBy("ticket"), "qa_ticket_rail"));
  const names = rail.columns.map((c) => c.name);

  it("lists the details fields after Effort, in order, edited in place; the last closes the group", () => {
    const at = names.indexOf("effort");
    expect(names.slice(at, at + 5)).toEqual(["effort", "channel", "hours", "received", "notes"]);
    const cols = Object.fromEntries(rail.columns.map((c) => [c.name, c]));
    expect(cols.effort.cellPaddingBottom).toBe(2);
    expect(cols.notes.cellPaddingBottom).toBe(10);
    expect(cols.channel).toMatchObject({ type: "status_pill", allowEditInView: true, pillColors: { phone: "qa_tag", email: "qa_tag", "office hours": "qa_tag" } });
    expect(cols.hours).toMatchObject({ type: "number", allowEditInView: true });
    expect(cols.received).toMatchObject({ type: "date", allowEditInView: true });
    expect(cols.notes).toMatchObject({ type: "textarea", allowEditInView: true });
    expect(names).not.toContain("requester");
  });

  it("keeps Effort closing the group without fields", () => {
    const plain = dataOf(sectionById(pageBy("ticket", install([])), "qa_ticket_rail"));
    expect(plain.columns.find((c) => c.name === "effort").cellPaddingBottom).toBe(10);
  });

  it("labels the fields' changes in History", () => {
    const history = dataOf(sectionById(pageBy("ticket"), "qa_ticket_history_list"));
    expect(history.columns.find((c) => c.normalName === "field_disp").name).toContain("when 'channel' then 'Channel'");
  });
});

describe("the Tickets page", () => {
  const page = pageBy("tickets");
  const table = dataOf(sectionById(page, "qa_tickets_table"));
  const bar = dataOf(sectionById(page, "qa_tickets_filters"));

  it("adds a column per table field, before Updated", () => {
    const shown = table.columns.filter((c) => c.show !== false).map((c) => c.normalName || c.name);
    const at = shown.indexOf("updated_day");
    expect(shown.slice(at - 3, at)).toEqual(["ds.channel", "ds.hours", "f_received"]);
    expect(table.columns.find((c) => c.name === "ds.channel")).toMatchObject({ type: "status_pill", pillColors: { phone: "qa_tag" } });
    expect(table.columns.find((c) => c.normalName === "f_received")).toMatchObject({ formatFn: "date" });
  });

  it("adds a chip per filter field, a filter the table reads, and its URL variable", () => {
    const chips = bar.columns.filter((c) => c.type === "filter_control").map((c) => c.searchParamKey);
    expect(chips.slice(-2)).toEqual(["channel", "requester"]);
    expect(bar.display.cellsGridSize).toBe(11);
    expect(bar.display.cellsTracksTemplate.split(" ").filter((x) => x === "auto")).toHaveLength(9);
    const filterKeys = table.filters.groups.map((g) => g.searchParamKey);
    expect(filterKeys).toEqual(expect.arrayContaining(["channel", "requester"]));
    expect(table.filters.groups.find((g) => g.searchParamKey === "requester").col).toBe("ds.requester");
    // a filtered field the table doesn't show is still listed, hidden, so its filter resolves
    expect(table.columns.find((c) => c.name === "ds.requester")).toEqual({ name: "ds.requester", show: false });
    expect(table.columns.filter((c) => c.name === "ds.channel")).toHaveLength(1);
    expect(page.filters.map((f) => f.searchKey)).toEqual(expect.arrayContaining(["channel", "requester"]));
  });

  it("is as before without fields", () => {
    const plain = dataOf(sectionById(pageBy("tickets", install([])), "qa_tickets_filters"));
    expect(plain.display.cellsGridSize).toBe(9);
    expect(plain.display.cellsTracksTemplate).toBe("auto auto auto minmax(180px,20rem) auto auto auto auto minmax(0,1fr)");
  });
});

describe("Recent activity", () => {
  it("labels the fields' changes and shows a pick list's values as pills, the record's colours first", () => {
    const list = dataOf(sectionById(pageBy("overview"), "qa_overview_activity_list"));
    expect(list.columns.find((c) => c.normalName === "a_field").name).toContain("when 'channel' then 'Channel'");
    const pills = list.columns.find((c) => c.pillColors?.Filed)?.pillColors;
    expect(pills.phone).toBe("qa_tag");
    const clash = dataOf(sectionById(pageBy("overview", install([{ ...CHANNEL, options: ["Minor"] }])), "qa_overview_activity_list"));
    expect(clash.columns.find((c) => c.pillColors?.Filed).pillColors.Minor).toBe("qa_sev_minor");
  });
});

describe("Page QA's New ticket", () => {
  it("asks for the form fields after the description", () => {
    const modal = dataOf(sectionById(pageBy("page"), "qa_page_add_ticket"));
    const names = modal.columns.map((c) => c.name);
    expect(names.slice(names.indexOf("description") + 1, names.indexOf("description") + 3)).toEqual(["channel", "received"]);
    expect(modal.columns.find((c) => c.name === "channel")).toMatchObject({ type: "radio", options: [{ label: "phone", value: "phone" }, { label: "email", value: "email" }, { label: "office hours", value: "office hours" }] });
    expect(modal.columns.find((c) => c.name === "received").type).toBe("date");
  });
});

describe("Report an issue", () => {
  it("asks for the install's form fields, from its settings or its stub", () => {
    expect(intakeFields(install()).map((f) => f.name)).toEqual(["channel", "received"]);
    const stub = { qa: { intake: { tickets: datasets.tickets, patterns: datasets.patterns, fields: [{ name: "channel", label: "Channel", type: "pick_one", options: ["phone"], required: true, show: { form: true } }] } } };
    expect(intakeFields(stub)).toMatchObject([{ name: "channel", required: true, options: ["phone"] }]);
    expect(intakeFields({ qa: { intake: { tickets: datasets.tickets, patterns: datasets.patterns } } })).toEqual([]);
  });

  it("holds Send back until a required field is filled", () => {
    expect(missingRequired([CHANNEL], {})).toBe(true);
    expect(missingRequired([CHANNEL], { channel: "  " })).toBe(true);
    expect(missingRequired([CHANNEL], { channel: "phone" })).toBe(false);
    expect(missingRequired([RECEIVED], {})).toBe(false);
  });

  it("files what was entered, leaving out an empty field", () => {
    const row = reportRow({
      title: "t", description: "d", site: { surface: "s" }, page: { url_slug: "p" },
      fields: [CHANNEL, RECEIVED], values: { channel: " phone ", received: "" },
    });
    expect(row.channel).toBe("phone");
    expect("received" in row).toBe(false);
  });
});
