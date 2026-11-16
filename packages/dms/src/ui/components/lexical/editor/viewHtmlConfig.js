import { htmlConfig } from './htmlConfig';
import { ButtonNode, resolveButtonStyleName } from './nodes/ButtonNode';
import { getComponentTheme } from '../../../useTheme';

/**
 * HTML export config for the server-rendered VIEW of a rich-text value (see
 * `getHtmlSync`'s `dmsTheme` option and the static-first view in `editor/index.tsx`).
 *
 * It is the library's `htmlConfig` plus a themed export for buttons. The default
 * ButtonNode export is a bare `<a>` for HTML/PDF round-trips; here the button should
 * look like the live editor's `ButtonComponent` (UI.Button with the resolved style),
 * so the page doesn't shift when the live editor replaces the server HTML. The live
 * editor owns the click behaviour; this markup is only what paints before hydration.
 */
export function buildViewHtmlConfig(dmsTheme) {
  if (!dmsTheme) return htmlConfig;
  const exportMap = new Map(htmlConfig.export);
  exportMap.set(ButtonNode, (editor, node) => {
    // the same wrapper the live editor puts a decorator in
    const wrapper = node.createDOM(editor._config, editor);
    const activeStyle = resolveButtonStyleName(dmsTheme?.button, node.__style);
    const t = getComponentTheme(dmsTheme, 'button', activeStyle);
    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    if (t?.button) button.setAttribute('class', t.button);
    button.textContent = node.__linkText || 'submit';
    wrapper.appendChild(button);
    return { element: wrapper };
  });
  return { ...htmlConfig, export: exportMap };
}
