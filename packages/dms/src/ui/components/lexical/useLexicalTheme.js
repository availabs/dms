/**
 * useLexicalTheme Hook
 *
 * Provides access to the lexical theme from DMS ThemeContext.
 * Merges textSettings headings into the lexical theme when available.
 */

import { useContext } from 'react';
import { ThemeContext, getComponentTheme } from '../../useTheme';
import { lexicalTheme, buildLexicalInternalTheme } from './theme';

/**
 * Hook to access the flat lexical theme from ThemeContext.
 * This returns the flat-key theme object for use in plugin components.
 *
 * @returns {Object} - Flat theme object with underscore-separated keys
 */
export function useLexicalTheme() {
  const { theme } = useContext(ThemeContext) || {};

  // Get lexical styles from theme context (with activeStyle support)
  const lexicalStyles = getComponentTheme(theme, 'lexical', 0);

  // Get textSettings styles for heading overrides
  const textStyles = getComponentTheme(theme, 'textSettings', 0);

  // If no theme context, return default lexical theme styles
  if (!lexicalStyles || Object.keys(lexicalStyles).length === 0) {
    return lexicalTheme.styles[0];
  }

  // Merge textSettings headings into lexical theme if available
  const mergedTheme = { ...lexicalStyles };

  if (textStyles) {
    // Override lexical headings with textSettings headings
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
 * Hook to get the nested lexical theme for LexicalComposer.
 * Converts the flat theme back to nested format.
 *
 * @returns {Object} - Nested theme object for LexicalComposer
 */
export function useLexicalInternalTheme() {
  const flatTheme = useLexicalTheme();
  return buildLexicalInternalTheme(flatTheme);
}

/**
 * Get the flat lexical theme from a theme object (non-hook version).
 * Useful when you have direct access to theme and don't need reactive updates.
 *
 * @param {Object} theme - The full theme object from context
 * @returns {Object} - Flat theme object
 */
export function getLexicalTheme(theme) {
  const lexicalStyles = getComponentTheme(theme, 'lexical', 0);
  const textStyles = getComponentTheme(theme, 'textSettings', 0);

  if (!lexicalStyles || Object.keys(lexicalStyles).length === 0) {
    return lexicalTheme.styles[0];
  }

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
 * Get nested lexical theme from a theme object (non-hook version).
 *
 * @param {Object} theme - The full theme object from context
 * @returns {Object} - Nested theme object for LexicalComposer
 */
export function getLexicalInternalTheme(theme) {
  const flatTheme = getLexicalTheme(theme);
  return buildLexicalInternalTheme(flatTheme);
}

export default useLexicalTheme;
