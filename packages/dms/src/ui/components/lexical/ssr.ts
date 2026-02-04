import { $generateHtmlFromNodes } from '@lexical/html';
import { createHeadlessEditor } from './editor/index';

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Sets up a fake DOM for Node.js SSR using linkedom.
 * Only needed in Node.js where there's no real DOM.
 */
function setupDomForSSR() {
  // Dynamic import to avoid loading linkedom in browser bundles
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

export async function getHtml(serializedEditorState: string): Promise<string> {
  if (!serializedEditorState) {
    return '';
  }

  const html = await new Promise<string>((resolve, reject) => {
    try {
      const editor = createHeadlessEditor({ namespace: 'html-renderer' });
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
