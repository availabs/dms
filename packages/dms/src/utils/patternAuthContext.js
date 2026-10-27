import { createContext } from 'react';

// The pattern a route belongs to, for chrome that renders in every pattern's layout (the user menus):
// `app` and the pattern's `authPermissions`, resolved for the current subdomain. pattern2routes
// (render/spa/utils/index.js) provides it around each pattern's routes. Read the menu's group with
// utils/auth.js rankUserGroups.
export const PatternAuthContext = createContext({ app: undefined, authPermissions: {} });
