export { dmsDataLoader, dmsDataEditor, checkIdsExist, loadItemFresh, _setSyncAPI } from './api'
export { updateRegisteredFormats, updateAttributes, json2DmsForm, initializePatternFormat } from './dms-manager/_utils'
export { default as dmsColumnTypes } from './ui/columnTypes'
export { default as dmsPageFactory } from './render/dmsPageFactory'
export { default as dmsSiteFactory, DmsSite } from "./render/spa/dmsSiteFactory";
export { collectThemeNames } from "./render/spa/utils";
export { lazyComponent, preloadLazyComponents } from "./utils/lazyComponent";
export { CMSContext, PageContext, ComponentContext } from './patterns/page/context'
export { useAuth } from './patterns/auth/context';
export { withAuth, authProvider } from './patterns/auth/providers';
export { default as adminConfig }  from './patterns/admin/siteConfig'
export { registerComponents } from "./patterns/page/components/sections/componentRegistry"
export { registerSectionMenuExtensions } from "./patterns/page/components/sections/sectionMenuExtensions"
export { registerSectionHeaderExtensions } from "./patterns/page/components/sections/sectionHeaderExtensions"
export { registerPatternTypes, getPatternType, listPatternTypes } from "./patterns/registry"

// Building blocks for pattern types a host app registers (registerPatternTypes)
// — e.g. dms-template's map editor. The map runtime has its own entry, ./map.js,
// so this one doesn't pull it into every page's bundle.
export { default as UI } from './ui'
export { default as Icons } from './ui/icons'
export { ThemeContext, getComponentTheme, getPatternTheme } from './ui/useTheme'
export { getInstance } from './utils/type-utils'
export { formatFunctions } from './patterns/page/components/sections/components/dataWrapper/utils/utils.jsx'
export { resolveComparisonVariants, SELF_PARAM_KEY_SENTINEL, selfParamKey } from './patterns/page/components/sections/components/dataWrapper/buildUdaConfig'
export { readAuthority, isAuthoritative, keyLabel, singleAuthoritativeViewId, sortAuthoritativeFirst } from './patterns/datasets/utils/authority'
