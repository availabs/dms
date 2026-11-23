import { useEffect } from 'react';

// The in-browser Tailwind compiler, for the page editor only.
//
// View pages get every class they render from stylesheets: the build's, and the site's server-compiled one
// (dms-server css/siteCss.js), which covers class strings saved in content. An author typing a new class into a
// Card cell, a section setting or a layout node needs it styled before saving, and no sheet has it yet. So the
// editor loads @tailwindcss/browser once per tab (it then scans the live DOM and compiles what's missing, as every
// page did before), with the app's `dark` variant (src/index.css). After a save the site's sheet is rebuilt with
// the new class. Task: src/dms/planning/tasks/current/server-compiled-site-css.md (P2).
const SRC = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4';
const DARK_VARIANT = '@custom-variant dark (&:where(.dark, .dark *, [data-theme="dark"], [data-theme="dark"] *));';

export function useRuntimeTailwind() {
    useEffect(() => {
        if (typeof document === 'undefined') return;
        if (document.querySelector('script[src*="@tailwindcss/browser"]')) return;
        const style = document.createElement('style');
        style.setAttribute('type', 'text/tailwindcss');
        style.textContent = DARK_VARIANT;
        const script = document.createElement('script');
        script.src = SRC;
        document.head.append(style, script);
    }, []);
}
