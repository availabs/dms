/**
 * status_pill's `pillColors["*"]`: the style for every value the map doesn't name, ahead of the
 * keyword guesses. A map without "*" resolves as before.
 *
 * Run: npx vitest run packages/dms/tests/statusPillDefault.test.jsx --root src/dms
 */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeContext } from "../src/ui/useTheme";
import { StatusPillView } from "../src/ui/columnTypes/statusPill";

// a stand-in Pill that prints the style it was given
const UI = { Pill: ({ activeStyle, text }) => <span data-style={activeStyle}>{text}</span> };
const styleOf = (value, pillColors) => {
  const html = renderToStaticMarkup(
    <ThemeContext.Provider value={{ theme: {}, UI }}><StatusPillView value={value} pillColors={pillColors} /></ThemeContext.Provider>,
  );
  return html.match(/data-style="([^"]*)"/)?.[1] ?? null;
};

describe("status_pill pillColors['*']", () => {
  const map = { Resolved: "qa_status_done", "*": "qa_plain" };

  it("a named value keeps its own style", () => {
    expect(styleOf("Resolved", map)).toBe("qa_status_done");
  });

  it("any other value takes the '*' style, before the keyword guesses", () => {
    expect(styleOf("dev@example.com", map)).toBe("qa_plain");
    expect(styleOf("below target", map)).toBe("qa_plain");
  });

  it("without '*', resolution is unchanged", () => {
    expect(styleOf("below target", { Resolved: "qa_status_done" })).toBe("status_bad");
    expect(styleOf("dev@example.com", { Resolved: "qa_status_done" })).toBe("status_na");
    expect(styleOf("", map)).toBe(null);
  });
});
