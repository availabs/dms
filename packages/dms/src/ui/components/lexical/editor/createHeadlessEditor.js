import { createHeadlessEditor as _createHeadlessEditor } from '@lexical/headless';
import { htmlConfig } from './htmlConfig';
import PlaygroundNodes from './nodes/PlaygroundNodes';
import { lexicalTheme as defaultLexicalTheme, buildLexicalInternalTheme } from '../theme';

export const createHeadlessEditor = ({ namespace, flatTheme, icons }) => {
  const resolvedFlatTheme = flatTheme || defaultLexicalTheme.styles[0];
  const nestedLexicalTheme = buildLexicalInternalTheme(resolvedFlatTheme);
  if (icons) {
    nestedLexicalTheme.Icons = icons;
  }
  return _createHeadlessEditor({
    namespace,
    nodes: [...PlaygroundNodes],
    theme: nestedLexicalTheme,
    onError: e => {
      console.error(e);
    },
    html: htmlConfig,
  });
};
