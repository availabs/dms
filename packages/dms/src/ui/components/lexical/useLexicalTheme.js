/**
 * Lexical Theme Utilities
 *
 * Provides a LexicalThemeContext and hook for accessing the theme within lexical components.
 * This context is separate from the main ThemeContext to avoid circular imports.
 *
 * The editor entry point receives theme as a prop and provides it via LexicalThemeContext.
 * Plugin components use useLexicalTheme() to access the flat theme.
 */

import * as React from 'react';
import { lexicalTheme, buildLexicalInternalTheme } from './theme';

/**
 * Context for providing the DMS theme to lexical components.
 * This is populated by the editor entry point (index.tsx).
 */
export const LexicalThemeContext = React.createContext(null);

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
  if (!lexicalStyles || Object.keys(lexicalStyles).length === 0) {
    return lexicalTheme.styles[0];
  }

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
 * Hook to get the flat lexical theme from LexicalThemeContext.
 * Use this in plugin components to access theme styles.
 *
 * @returns {Object} - Flat theme object with underscore-separated keys
 */
export function useLexicalTheme() {
  const contextTheme = React.useContext(LexicalThemeContext);
  return getLexicalTheme(contextTheme);
}

export default getLexicalTheme;
