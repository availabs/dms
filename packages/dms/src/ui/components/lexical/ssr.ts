import { $generateHtmlFromNodes } from '@lexical/html';
import { createHeadlessEditor } from './editor/index';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Attaches interactive toggle handlers to collapsible sections within a container element.
 * Call after rendering HTML from getHtml() via dangerouslySetInnerHTML.
 * Returns a cleanup function that removes all event listeners.
 */
export function attachCollapsibleHandlers(root: HTMLElement): () => void {
  const containers = root.querySelectorAll('.Collapsible__container');
  const cleanups: (() => void)[] = [];

  containers.forEach(container => {
    const content = container.querySelector(':scope > .Collapsible__content');
    const title = container.querySelector(':scope > .Collapsible__title');
    const button = container.querySelector(':scope > .collapsible-toggle');
    if (!content) return;

    const toggle = () => {
      const isClosed = content.classList.contains('overflow-hidden');
      const isNoPreview = !!title?.querySelector('svg.cursor-pointer');

      if (isClosed) {
        content.classList.remove(
          'text-[#2D3E4C]', 'max-h-[64px]', 'overflow-hidden',
          '[mask-image:linear-gradient(to_bottom,_rgba(0,0,0,1),_rgba(0,0,0,0.2))]',
          'print:overflow-visible', 'print:max-h-full'
        );
        content.classList.add('text-[#37576B]', 'overflow-auto');
        container.classList.remove('max-h-[50px]', 'overflow-hidden');
        if (title) title.classList.add('border-b', 'border-[#C5D7E0]');
        if (button) button.textContent = 'SHOW LESS';
      } else {
        content.classList.remove('text-[#37576B]', 'overflow-auto');
        content.classList.add('text-[#2D3E4C]', 'max-h-[64px]', 'overflow-hidden');
        if (isNoPreview) {
          container.classList.add('max-h-[50px]', 'overflow-hidden');
          content.classList.add('print:overflow-visible', 'print:max-h-full');
          if (title) title.classList.remove('border-b', 'border-[#C5D7E0]');
        } else {
          content.classList.add(
            '[mask-image:linear-gradient(to_bottom,_rgba(0,0,0,1),_rgba(0,0,0,0.2))]'
          );
        }
        if (button) button.textContent = 'SHOW MORE';
      }
    };

    if (button) {
      button.addEventListener('click', toggle);
      cleanups.push(() => button.removeEventListener('click', toggle));
    }
    const icon = title?.querySelector('svg.cursor-pointer');
    if (icon) {
      icon.addEventListener('click', toggle);
      cleanups.push(() => icon.removeEventListener('click', toggle));
    }
  });

  return () => cleanups.forEach(fn => fn());
}

/**
 * Sets up a fake DOM for Node.js SSR using linkedom.
 * Only needed in Node.js where there's no real DOM.
 */
function setupDomForSSR() {
  // Dynamic import to avoid loading linkedom in browser bundles
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseHTML } = require('linkedom');
  const { window, document } = parseHTML('<html><body></body></html>');

  const _window = globalThis.window;
  const _document = globalThis.document;

  globalThis.window = window;
  globalThis.document = document;

  return () => {
    globalThis.window = _window;
    globalThis.document = _document;
  };
}

export function getHtmlSync(serializedEditorState: string, flatTheme?: object, icons?: object): string {
  if (!serializedEditorState) return '';

  try {
    const editor = createHeadlessEditor({ namespace: 'html-renderer', flatTheme, icons });
    const editorState = editor.parseEditorState(serializedEditorState);
    editor.setEditorState(editorState);

    let html = '';
    editorState.read(() => {
      html = $generateHtmlFromNodes(editor, null);
    });
    return html;
  } catch (e) {
    console.error('Error generating HTML:', e);
    return '';
  }
}

export async function getHtml(serializedEditorState: string, flatTheme?: object, icons?: object): Promise<string> {
  if (!serializedEditorState) {
    return '';
  }

  const html = await new Promise<string>((resolve, reject) => {
    try {
      const editor = createHeadlessEditor({ namespace: 'html-renderer', flatTheme, icons });
      editor.setEditorState(editor.parseEditorState(serializedEditorState));

      editor.update(() => {
        try {
          let cleanup: (() => void) | null = null;

          if (!isBrowser) {
            // SSR: Set up fake DOM with linkedom
            cleanup = setupDomForSSR();
          }
          // Browser: No setup needed - $generateHtmlFromNodes uses document.createElement
          // which creates detached elements in memory, doesn't affect the page DOM

          const _html = $generateHtmlFromNodes(editor, null);

          if (cleanup) {
            cleanup();
          }

          resolve(_html);
        } catch (e) {
          console.error('Error generating HTML from Lexical nodes:', e);
          reject(e);
        }
      });
    } catch (e) {
      console.error('Error setting up headless editor:', e);
      reject(e);
    }
  });

  return html;
}
