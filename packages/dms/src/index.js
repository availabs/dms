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
// — e.g. dms-template's qa (Tickets) pattern: a route config built on the page pattern's (its view,
// auth check and section preloading), nav widgets, admin panels, dataset reads and code-built pages.
export { loadThemeFonts } from './ui/useTheme'
export { registerWidget } from './ui/widgets'
export { default as PageView } from './patterns/page/pages/view'
export { defaultCheckAuth } from './dms-manager/_auth'
export { preloadSectionComponents } from './patterns/page/components/sections/componentRegistry'
export { pageSectionTypes } from './api/preloadSectionData.js'
export { applyCreateDefaults } from './patterns/page/components/sections/components/dataWrapper/getData'
export { lexicalElementData, headingBodyLexicalState } from './ui/pageTemplates'
// Lexical editor state → static HTML, with no editor instance and no browser. The read-only
// path for anything that renders MANY rich-text values at once (the chat pattern's message
// list: 50 messages a window, none of them editable in place). `LexicalView` mounts a real
// editor per value, which is right for one section on a page and wrong for a list.
export { getHtmlSync as lexicalToHtml } from './ui/components/lexical/ssr'
// The editor itself, for a pattern that composes rich text outside a page section (the chat
// composer). No bundle cost: `dmsColumnTypes` above already imports both statically, so they
// are in the main graph either way.
export { LexicalEdit, LexicalView } from './ui/components/lexical'
export { AdminContext } from './patterns/admin/context'
export { getSourceIdsBySlug } from './api/sourceIdBySlug'
export { CHANGE_HISTORY_COLUMNS } from './patterns/datasets/utils/changeHistory'
// base component themes an app pattern builds its own named styles from
export { tableTheme } from './ui/components/table/table.theme'
export { inputTheme } from './ui/components/Input.theme'
export { sectionArrayTheme } from './patterns/page/components/sections/sectionArray.theme'
export { dataBarTheme } from './ui/columnTypes/dataBar.theme'
export { stackedBarTheme } from './ui/columnTypes/stacked_bar.theme'
export { flowStepTheme } from './ui/columnTypes/flow_step.theme'
