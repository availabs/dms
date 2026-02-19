/**
 * ThemeContext - Separated to avoid circular imports
 *
 * This file exports only ThemeContext without importing defaultTheme,
 * allowing components like lexical to access ThemeContext without
 * triggering the full import chain that causes circular dependencies.
 */
import React from "react";

export const ThemeContext = React.createContext(null);
