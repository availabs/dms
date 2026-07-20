# Input/Textarea: `activeStyle` theming key leaked onto the DOM element

> **Status:** ✅ FIXED + VERIFIED (2026-07-07). One-line BC fix ×2.
> **Origin:** QA-agent ticket #102 on tsmo2 incident_search — "React does not recognize the
> `activeStyle` prop on a DOM element" on every load.

Themed callers (filter controls, column types) legitimately pass `activeStyle` (the named-style
selector) alongside real input props; `ui/components/Input.jsx`'s `Input` and `Textarea` spread
`...props` straight onto the raw `<input>`/`<textarea>`, so the key landed in the DOM and React
warned. Fix: destructure `activeStyle` out (unused — Input doesn't resolve `styles[]` today; if
it grows named styles, wire it into `getComponentTheme` instead). BC: a non-DOM prop no longer
reaches the DOM; no behavior change. Verified: incident_search loads with zero console errors
(console-arg capture). **Sync to transportNY** with the pending core batch.
