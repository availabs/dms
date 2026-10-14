// Locked UI components (Button, Pill, Input, Textarea, Modal) take their look only from the theme
// (`activeStyle` → a named style); a `className` prop is dropped. Dropping it silently hid two Modal
// callers whose look was lost (2026-10-14), so in development a passed className is reported once
// per component + value. Production does nothing.
const warned = new Set();

export function warnLockedClassName(component, className) {
    if (!import.meta.env?.DEV || !className) return;
    const key = `${component}|${className}`;
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(
        `[dms] <${component}> ignores className ("${className}"): its look comes from the theme only. ` +
        `Use activeStyle with a named style in ${component}.theme instead.`
    );
}
