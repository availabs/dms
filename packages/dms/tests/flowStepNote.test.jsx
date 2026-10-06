/**
 * flow_step: the optional `stepNote` (a second line) and `stepDashed` (a step beside the flow) added
 * for the QA Tickets "Waiting" step. Without them a step renders exactly as before: the golden
 * (fixtures/flowStepGolden.json) is the pre-change component's output, captured from HEAD 2026-10-05.
 *
 * Run: npx vitest run packages/dms/tests/flowStepNote.test.jsx
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FlowStepView } from "../src/ui/columnTypes/flow_step.jsx";
import { flowStepTheme } from "../src/ui/columnTypes/flow_step.theme.js";
import golden from "./fixtures/flowStepGolden.json";

const CASES = [
  { value: 3, customName: "Triage" },
  { value: { value: 2 }, display_name: "In review", stepColor: "warn", connector: true },
  { value: 5, customName: "Done", stepColor: "done", stepTint: true },
  { value: 0, customName: "X", stepColor: "nope" },
];

describe("flow_step", () => {
  it("renders the pre-change markup when neither option is set", () => {
    expect(CASES.map((c) => renderToStaticMarkup(<FlowStepView {...c} />))).toEqual(golden);
  });
  it("stepNote stacks a second line under the label", () => {
    const html = renderToStaticMarkup(<FlowStepView value={0} customName="Waiting" stepNote="needs a decision or data" />);
    expect(html).toContain(`<span class="${flowStepTheme.labelStack}"><span class="${flowStepTheme.label}">Waiting</span><span class="${flowStepTheme.note}">needs a decision or data</span></span>`);
  });
  it("stepDashed uses the dashed box; stepTint still wins", () => {
    expect(renderToStaticMarkup(<FlowStepView value={0} customName="W" stepDashed />)).toContain(`class="${flowStepTheme.boxDashed}"`);
    expect(renderToStaticMarkup(<FlowStepView value={0} customName="W" stepDashed stepTint />)).toContain(`class="${flowStepTheme.boxTint}"`);
  });
});
