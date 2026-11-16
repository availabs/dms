import { createHeadlessEditor as _createHeadlessEditor } from '@lexical/headless';
import { htmlConfig } from './htmlConfig';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import { lexicalTheme as defaultLexicalTheme, buildLexicalInternalTheme } from '../theme';

// nestedTheme: an already-built nested theme (the live editor's, with brandTextStyles and
// Icons), used as is. html: an export config other than the default (viewHtmlConfig.js).
export const createHeadlessEditor = ({ namespace, flatTheme, icons, nestedTheme, html }) => {
  const nestedLexicalTheme = nestedTheme || buildLexicalInternalTheme(flatTheme || defaultLexicalTheme.styles[0]);
  if (icons && !nestedTheme) {
    nestedLexicalTheme.Icons = icons;
  }
  return _createHeadlessEditor({
    namespace,
    nodes: [...PlaygroundNodes],
    theme: nestedLexicalTheme,
    onError: e => {
      console.error(e);
    },
    html: html || htmlConfig,
  });
};
