// A field's control must sit above its container's decoration. Some themes draw the field box as positioned
// pseudo-elements on the container (MNY's Catalyst-style `inputContainer`: `before:absolute before:inset-px
// before:bg-white …`); a positioned ::before paints over an unpositioned <input>/<textarea> and takes its clicks
// (2026-10-17: MNY history-pane comment field). So the primitives keep the control positioned: `relative` unless the
// theme's string already positions it. Structural, not a look — no offsets, no z-index.
const POSITIONED = /(^|\s)(relative|absolute|fixed|sticky)(\s|$)/;

export const fieldOnTop = cls => POSITIONED.test(cls || '') ? cls : `${cls || ''} relative`.trim();
