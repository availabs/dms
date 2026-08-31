/**
 * MountContext — which of a pattern's mounts the current render is serving.
 *
 * Carries the mount's `baseUrl` plus `siteRootPaths` (every pattern mount's first
 * path segment) so link consumers under `ui/` can resolve SITE-ABSOLUTE authored
 * values against the mount they are actually on — see utils/mountPath.js.
 *
 * Kept next to ThemeContext, and deliberately provider-optional: `ui/` components
 * must not import from `patterns/`, and a missing provider (any pattern that does
 * not supply one, plus every existing consumer) reads `{}` and resolves to today's
 * behavior. Provided by the page pattern in patterns/page/siteConfig.jsx.
 */
import React from "react";

export const MountContext = React.createContext({});
