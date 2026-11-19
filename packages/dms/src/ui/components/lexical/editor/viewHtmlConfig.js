import { DecoratorNode, LineBreakNode } from 'lexical';
import { TableCellNode, TableNode } from '@lexical/table';
import { $generateHtmlFromNodes } from '@lexical/html';
import { htmlConfig } from './htmlConfig';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import { ButtonNode, resolveButtonStyleName } from './nodes/ButtonNode';
import { InlineImageNode } from './nodes/InlineImageNode';
import { IconNode } from './nodes/IconNode';
import { getComponentTheme } from '../../../useTheme';

/**
 * HTML export config for the server-rendered VIEW of a rich-text value (see
 * `getHtmlSync`'s `dmsTheme` option and the static-first view in `editor/index.tsx`).
 * The live editor replaces this HTML right after hydration, so the aim is that the
 * page does not move when it does. Two differences from the library's `htmlConfig`
 * (which HTML/PDF export keeps using):
 *
 * - Buttons. The default export is a bare `<a>` for round-trips; here it is the
 *   `<button>` the live `ButtonComponent` renders, with the theme's resolved style.
 * - The live editor's managed line break: an element whose last child is a line
 *   break or an inline decorator gets an extra `<br>` (Lexical's reconciler,
 *   `setManagedLineBreak`), which gives that line its height.
 */
export function buildViewHtmlConfig(dmsTheme) {
  const exportMap = new Map(htmlConfig.export);

  exportMap.set(ButtonNode, (editor, node) => {
    // the same wrapper the live editor puts a decorator in
    const wrapper = node.createDOM(editor._config, editor);
    const activeStyle = resolveButtonStyleName(dmsTheme?.button, node.__style);
    const t = getComponentTheme(dmsTheme || {}, 'button', activeStyle);
    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    if (t?.button) button.setAttribute('class', t.button);
    button.textContent = node.__linkText || 'submit';
    wrapper.appendChild(button);
    return { element: wrapper };
  });

  // Images: the live InlineImageComponent's markup, wrapper div included, with width/height
  // `inherit` or px as it sets them. Without the div the browser sizes the image differently
  // (an image card column came out 15px wider). The live wrapper is a <div>, but parsed HTML
  // can't hold a <div> inside the <p>: the parser closes the paragraph and moves it out. The
  // theme class is `inline-block`, so a <span> lays out the same.
  exportMap.set(InlineImageNode, (editor, node) => {
    const span = node.createDOM(editor._config);
    const div = document.createElement('span');
    const base = editor._config.theme?.editor?.inlineImage?.base;
    if (base) div.setAttribute('class', base);
    const img = document.createElement('img');
    img.setAttribute('class', 'cursor-default');
    img.setAttribute('src', node.getSrc());
    img.setAttribute('alt', node.getAltText());
    img.setAttribute('data-position', node.__position);
    const size = v => (v === 'inherit' || v == null ? 'inherit' : `${v}px`);
    img.setAttribute('style', `display: block; height: ${size(node.__height)}; width: ${size(node.__width)};`);
    div.appendChild(img);
    span.appendChild(div);
    const caption = node.__showCaption ? captionElement(editor, node) : null;
    if (caption) span.appendChild(caption);
    return { element: span };
  });

  // Icons are React components and can't be rendered to markup inside the server render, so
  // reserve the icon's box: an empty <svg> with the live icon's size classes (IconNode.decorate).
  // The icon itself draws when the live editor takes over; nothing moves.
  exportMap.set(IconNode, (editor, node) => {
    const theme = editor._config.theme || {};
    const host = node.createDOM(editor._config);
    const style = node.__styleKey ? theme.iconStyles?.[node.__styleKey] : null;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', style ? (style.icon || 'w-6 h-6') : 'w-[1.5em] h-[1.5em] -mt-[5px]');
    if (style) {
      const box = document.createElement('span');
      if (style.box) box.setAttribute('class', style.box);
      box.appendChild(svg);
      host.appendChild(box);
    } else {
      host.appendChild(svg);
    }
    return { element: host };
  });

  // Table cells: Lexical's export adds round-trip styles the live cell doesn't have (a black
  // 1px border, a 75px width, `text-align: start`, a grey header background), which change how
  // the table lays out. Keep the cell's live inline style (`createDOM`: its own width, colour,
  // vertical alignment) and its alignment, with the export's span and marker attributes.
  exportMap.set(TableCellNode, (editor, node) => {
    const out = node.exportDOM(editor);
    const el = out?.element;
    if (!el || typeof el.setAttribute !== 'function') return out;
    const live = node.createDOM(editor._config);
    const style = live.getAttribute('style');
    if (style) el.setAttribute('style', style); else el.removeAttribute('style');
    const format = node.getFormatType();
    if (format) el.style.textAlign = format;
    return out;
  });

  // Tables: the live TablePlugin runs with hasHorizontalScroll, which puts every table in the
  // theme's scroll container (`tableScrollableWrapper`: its margins, and `overflow-x-auto`, which
  // keeps a wide table from widening its column). Lexical's export returns the bare <table>.
  exportMap.set(TableNode, (editor, node) => {
    const out = node.exportDOM(editor);
    const wrapperClass = editor._config.theme?.tableScrollableWrapper;
    if (!out?.after || !wrapperClass) return out;
    return {
      ...out,
      after: (el) => {
        const table = out.after(el);
        if (!table) return table;
        // Lexical swaps `el` for what this returns (el.replaceWith), so `el` has to stay where it
        // is: the wrapper holds a copy
        const wrapper = document.createElement('div');
        wrapper.setAttribute('class', wrapperClass);
        wrapper.appendChild(table.cloneNode(true));
        return wrapper;
      },
    };
  });

  const klasses = [LineBreakNode, ...PlaygroundNodes.filter(k => typeof k === 'function' && k.prototype instanceof DecoratorNode)];
  for (const klass of klasses) {
    const base = exportMap.get(klass);
    exportMap.set(klass, (editor, node) => {
      const out = base ? base(editor, node) : node.exportDOM(editor);
      const managed = node.getNextSibling() === null
        && ($isLineBreak(node) || node.isInline())
        && out?.element && !out.after;
      if (!managed) return out;
      const fragment = document.createDocumentFragment();
      fragment.append(out.element, document.createElement('br'));
      return { ...out, element: fragment };
    });
  }

  return { ...htmlConfig, export: exportMap };
}

// An image's caption is its own nested editor. Live it renders under the image as the caption
// container › a content-editable root › its paragraphs, styled with the parent's theme (the
// nested composer inherits it). Here: the same, with every block element a <span> styled
// `display: block`, since the image sits inside a <p> and parsed HTML can't nest a <div> or <p> there.
const CAPTION_ROOT_CLASS = 'min-h-[20px] border-[0px] resize-none cursor-text block relative [tab-size:1] outline-[0px] p-[10px] select-text text-[14px] leading-[1.4em] w-[calc(100% - 20px)] whitespace-pre-wrap';
const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE']);

function captionElement(editor, node) {
  const captionEditor = node.__caption;
  if (!captionEditor) return null;
  const state = captionEditor.getEditorState();
  if (state.isEmpty()) return null;
  const config = captionEditor._config;
  const ownTheme = config.theme;
  config.theme = editor._config.theme;
  let html = '';
  try {
    state.read(() => { html = $generateHtmlFromNodes(captionEditor, null); }, { editor: captionEditor });
  } finally {
    config.theme = ownTheme;
  }
  if (!html) return null;

  const root = document.createElement('span');
  root.setAttribute('class', CAPTION_ROOT_CLASS);
  root.setAttribute('role', 'textbox');
  root.setAttribute('aria-readonly', 'true');
  root.setAttribute('style', 'display: block; user-select: text; white-space: pre-wrap; word-break: break-word;');
  root.innerHTML = html;
  for (const el of [...root.querySelectorAll('*')].reverse()) {
    if (!BLOCK_TAGS.has(el.tagName)) continue;
    const span = document.createElement('span');
    for (const { name, value } of [...el.attributes]) span.setAttribute(name, value);
    span.setAttribute('style', `display: block;${el.getAttribute('style') ? ' ' + el.getAttribute('style') : ''}`);
    while (el.firstChild) span.appendChild(el.firstChild);
    el.replaceWith(span);
  }
  const container = document.createElement('span');
  container.setAttribute('class', editor._config.theme?.editor?.inlineImage?.captionContainer || 'image-caption-container');
  container.setAttribute('style', 'display: block;');
  container.appendChild(root);
  return container;
}

function $isLineBreak(node) {
  return node instanceof LineBreakNode;
}
