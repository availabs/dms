// UI.Switch colours (sizes stay structural in Switch.jsx). v6 (2026-10-13, ui-controls.html): ink on,
// rule-strong off, paper knob, ink focus ring, disabled at 40% (2026-10-16). Pre-v6 indigo / gray / white frozen in
// src/themes/_legacy/ui.js `switch`. (transportny v2's own `switch` object uses other key names.)
export const switchTheme = {
    options: { activeStyle: 0 },
    styles: [{
        name: 'default',
        trackOn: 'bg-[var(--t-ink)]',
        trackOff: 'bg-[var(--t-rule-strong)]',
        knob: 'bg-[var(--t-paper)] shadow-[var(--t-shadow-lift)]',
        disabled: 'opacity-40 cursor-not-allowed', // ui-controls.html#switch disabled
        focus: 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)]',
    }],
};

export const docs = [
    { enabled: false, size: 'xs', doc_name: 'x-small inactive' },
    { enabled: true, size: 'xs', doc_name: 'x-small active' },
    { enabled: false, size: 'small', doc_name: 'small inactive' },
    { enabled: true, size: 'small', doc_name: 'small active' },
    { enabled: false, size: 'medium', doc_name: 'medium inactive' },
    { enabled: true, size: 'medium', doc_name: 'medium active' },
]
