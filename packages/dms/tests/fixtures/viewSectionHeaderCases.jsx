/**
 * The case table + renderer shared by `viewSectionHeaderLegacy.test.js` and its golden-capture
 * script. Lives outside the test file so the capture script can import it without vitest's
 * `describe` being in scope.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ViewSectionHeader } from "../../src/patterns/page/components/sections/section_components.jsx";
import { ThemeContext } from "../../src/ui/useTheme.js";

// Minimal stand-ins for the two UI atoms the header reaches for. Rendered as plain markers so a
// golden diff points at the header's own classes rather than at a UI-kit change.
const UI = {
  Popup: ({ button }) => <span data-popup="">{ button }</span>,
  Icon: ({ icon, className }) => <i data-icon={ icon } className={ className }/>,
};
const TitleComp = ({ className, value }) => <div className={ className }>{ value }</div>;
const HelpComp = () => <div data-help=""/>;

// A non-empty lexical doc, so the helpText branch actually renders.
const REAL_HELP = { root: { children: [{ children: [{ text: "why this section exists" }] }] } };

// `theme.heading` as the core default ships it (ui/defaultTheme.js) — the lookup the title class
// has always gone through. MitigateNY inherits exactly this.
const CORE_HEADING = {
  "1": "text-blue-500 font-bold text-xl tracking-wider py-1 pl-1",
  "2": "text-lg tracking-wider",
  "3": "text-md tracking-wide",
  base: "p-2 w-full font-sans font-medium text-md bg-transparent",
  default: "",
};

export const CASES = {
  // The overwhelmingly common shape: a title, no level, no tags, no help. Every NPMRDS report
  // graph section and most MitigateNY sections are exactly this.
  "title only, no level": {
    theme: { heading: CORE_HEADING },
    value: { title: "Daily Average Speed By Month" },
    helpTextArray: [],
  },
  // level '1' is page.format.js's registered default for the attribute, so any section whose
  // level was ever touched in the Settings drawer lands here.
  "title + level 1 (core blue heading)": {
    theme: { heading: CORE_HEADING },
    value: { title: "Hazard Profile", level: "1" },
    helpTextArray: [],
  },
  "title + level 3": {
    theme: { heading: CORE_HEADING },
    value: { title: "Repetitive Loss", level: "3" },
    helpTextArray: [],
  },
  // A title with spaces — the legacy `#Title` anchor id is built by replacing them.
  "title with spaces (legacy #anchor id)": {
    theme: { heading: CORE_HEADING },
    value: { title: "Average Speed by TMC by 5-Minute Epoch" },
    helpTextArray: [],
  },
  "title + tags": {
    theme: { heading: CORE_HEADING },
    value: { title: "Actions", tags: ["mitigation", "flood"] },
    helpTextArray: [],
  },
  "title + help text": {
    theme: { heading: CORE_HEADING },
    value: { title: "Total Hours of Delay" },
    helpTextArray: [{ text: REAL_HELP, icon: "InfoSquare" }],
  },
  "title + two help texts, one with a custom icon": {
    theme: { heading: CORE_HEADING },
    value: { title: "Reliability" },
    helpTextArray: [{ text: REAL_HELP }, { text: REAL_HELP, icon: "Alert" }],
  },
  // An EMPTY lexical doc must NOT render the info pill — the condition that decides this is
  // duplicated in section.jsx's showHeader, so it is worth locking here too.
  "title + empty help doc (renders no info pill)": {
    theme: { heading: CORE_HEADING },
    value: { title: "Empty Help" },
    helpTextArray: [{ text: { root: { children: [] } } }],
  },
  // A site with no `heading` key at all — the lookup falls through to undefined on both sides.
  "no theme.heading at all": {
    theme: {},
    value: { title: "Untitled Section" },
    helpTextArray: [],
  },
};

// `sectionTheme`/`headerExtensions` are undefined for every legacy CASE above, which is the
// point: the goldens are captured with them absent, exactly as an un-migrated site renders.
export const render = ({ theme, value, helpTextArray, sectionTheme, headerExtensions }) =>
  renderToStaticMarkup(
    <ThemeContext.Provider value={ { theme, UI } }>
      <ViewSectionHeader
        value={ value }
        TitleComp={ TitleComp }
        HelpComp={ HelpComp }
        helpTextArray={ helpTextArray }
        updateAttribute={ () => {} }
        sectionTheme={ sectionTheme }
        headerExtensions={ headerExtensions }
      />
    </ThemeContext.Provider>
  );
