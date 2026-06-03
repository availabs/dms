import React from "react";
import { ThemeContext } from "../useTheme";

// download_button column type — renders a themed UI.Button that downloads a file
// instead of showing a data value. Bind the column to a value that parameterizes
// the file (e.g. `year_record`); the value is interpolated into `urlTemplate` via
// the `{year}` / `{value}` placeholder, so the link tracks the page's year filter.
//
// Chrome-only (rung-3 "look depends on the value"): reads ONLY its own value, to
// build the href. Styling is delegated to the shared UI.Button primitive (so a site
// theme re-skins it) — pick the variant with `activeStyle`. Per-column knobs:
//   - urlTemplate : structured download URL, `{year}`/`{value}` where the value goes.
//   - buttonText  : label (default "Download CSV").
//   - activeStyle : UI.Button named style / index (default = theme's default button).
//
// UI.Button renders a <button>, so the actual download is triggered on click via a
// transient anchor (a real file download, not SPA navigation).
const interpolate = (tpl, value) =>
  String(tpl || "#").replace(/\{year\}|\{value\}/g, value == null ? "" : String(value));

const DownloadIcon = () => (
  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
       strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
  </svg>
);

export const DownloadButtonView = ({ value, urlTemplate, buttonText = "Download CSV", activeStyle }) => {
  const { UI } = React.useContext(ThemeContext) || {};
  const Button = UI?.Button;
  if (!Button) return null;
  const href = interpolate(urlTemplate, value);
  const onClick = () => {
    const a = document.createElement("a");
    a.href = href;
    a.setAttribute("download", "");
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  return (
    <Button activeStyle={activeStyle} onClick={onClick}>
      <DownloadIcon />
      {buttonText}
    </Button>
  );
};

// Nothing to edit on a derived download link; the edit/verify loop screenshots edit
// mode, so render the same button rather than a blank cell.
export const DownloadButtonEdit = (props) => <DownloadButtonView {...props} />;
