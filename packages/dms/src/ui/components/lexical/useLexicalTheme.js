/**
 * Lexical Theme Utilities
 *
 * Provides functions to get lexical theme from DMS theme object.
 */

import { /*lexicalTheme*/ buildLexicalInternalTheme } from './theme';

//const buildLexicalInternalTheme = d => d

/**
 * Helper to get component theme from a theme object
 * (same logic as getComponentTheme from useTheme, inlined to avoid circular import)
 */
function getComponentTheme(theme, compType, activeStyle) {
  if (!theme || !theme[compType]) return null;
  const componentTheme = theme[compType];
  const finalActiveStyle = activeStyle ?? componentTheme.options?.activeStyle ?? 0;
  return componentTheme?.styles
    ? componentTheme.styles[finalActiveStyle]
    : componentTheme || {};
}

/**
 * Get the flat lexical theme from a theme object.
 * Merges textSettings headings into the lexical theme when available.
 *
 * @param {Object} theme - The full theme object from ThemeContext
 * @returns {Object} - Flat theme object with underscore-separated keys
 */
export function getLexicalTheme(theme) {
  const lexicalStyles = getComponentTheme(theme, 'lexical', 0);
  const textStyles = getComponentTheme(theme, 'textSettings', 0);

  // If no theme or empty lexical styles, return default
  // if (!lexicalStyles || Object.keys(lexicalStyles).length === 0) {
  //   return lexicalTheme.styles[0];
  // }

  // Merge textSettings headings into lexical theme if available
  const mergedTheme = { ...lexicalStyles };

  if (textStyles) {
    if (textStyles.h1) mergedTheme.heading_h1 = textStyles.h1;
    if (textStyles.h2) mergedTheme.heading_h2 = textStyles.h2;
    if (textStyles.h3) mergedTheme.heading_h3 = textStyles.h3;
    if (textStyles.h4) mergedTheme.heading_h4 = textStyles.h4;
    if (textStyles.h5) mergedTheme.heading_h5 = textStyles.h5;
    if (textStyles.h6) mergedTheme.heading_h6 = textStyles.h6;
  }

  return mergedTheme;
}

/**
 * Get nested lexical theme from a theme object.
 * Converts the flat theme to nested format for LexicalComposer.
 *
 * @param {Object} theme - The full theme object from ThemeContext
 * @returns {Object} - Nested theme object for LexicalComposer
 */
export function getLexicalInternalTheme(theme) {
  const flatTheme = getLexicalTheme(theme);
  return buildLexicalInternalTheme(flatTheme);
}

/**
 * Get the flat lexical theme from a DMS theme object.
 *
 * @param {Object} theme - The full theme object from ThemeContext
 * @returns {Object} - Flat theme object with underscore-separated keys
 */
export function useLexicalTheme(theme) {
  return getLexicalTheme(theme);
}

export default getLexicalTheme;
