// Islands path (static-html-islands.md): a server-rendered page's live sections. Loaded lazily by
// IslandHost after hydration; this module is the one place the islands entry reaches the page
// pattern's section code (the registry, dataWrapper, column types), so pages with no islands never load it.
//
// For each island the server's HTML stays in place (inside the slot's `data-dms-island` element) until
// today's SectionView has rendered into the same element; then the server nodes are removed in the same
// commit, before paint. All islands share one PageContext, rebuilt here as the page view builds it
// (usePageViewState), so filters and component actions between live sections work as on today's path.
// Static sections are HTML and don't react to page state; only sections that read no data are static.
// A `wake` section keeps its server HTML until the reader uses it (IslandHost's `awake`) or the page's
// state is no longer what the server rendered with (a filter, an action parameter, the URL's parameters).
import React from 'react'
import { createPortal } from 'react-dom'
import { SectionView } from '../../patterns/page/components/sections/section'
import { registerComponents, getRegisteredComponents } from '../../patterns/page/components/sections/componentRegistry'
import { registerSectionHeaderExtensions } from '../../patterns/page/components/sections/sectionHeaderExtensions'
import { registerFormatFunction } from '../../patterns/page/components/sections/components/dataWrapper/utils/utils'
import { FilterControlCell } from '../../patterns/page/components/sections/FilterControlCell'
import { PageContext, CMSContext, DataSourceContext } from '../../patterns/page/context'
import { usePageViewState } from '../../patterns/page/pages/usePageViewState'
import cmsFormat from '../../patterns/page/page.format.js'
import { getAttributes, initializePatternFormat } from '../../dms-manager/_utils'
import { registerColumnType } from '../../ui/columnTypes'
import { ThemeContext } from '../../ui/useTheme'
import { dmsDataLoader, dmsDataEditor } from '../../api'
import { listPatternTypes } from '../../patterns/registry'

// What the page pattern's siteConfig registers at module load and per theme (patterns/page/siteConfig.jsx),
// and the pattern types' theme hooks (render/spa/utils pattern2routes).
registerColumnType('filter_control', { name: 'Filter Control', EditComp: FilterControlCell, ViewComp: FilterControlCell })
const registeredThemes = new WeakSet()
function registerThemeParts(theme) {
  if (!theme || registeredThemes.has(theme)) return
  registeredThemes.add(theme)
  if (theme.pageComponents) {
    const comps = theme.pageComponents
    registerComponents(Array.isArray(comps) ? Object.fromEntries(comps.map((c) => [c.key || c.name, c])) : comps)
  }
  Object.entries(theme.columnTypes || {}).forEach(([k, v]) => registerColumnType(k, v))
  Object.entries(theme.formatFunctions || {}).forEach(([name, def]) =>
    registerFormatFunction(name, typeof def === 'function' ? def : def.fn, typeof def === 'function' ? {} : def))
  Object.entries(theme.sectionHeaderExtensions || {}).forEach(([name, builders]) => registerSectionHeaderExtensions(name, builders))
  // what pattern2routes does with every loaded theme (e.g. map plugins a site theme ships)
  listPatternTypes().forEach((d) => d.registerFromTheme?.(theme))
}

// A section that throws keeps its server HTML (its nodes are only removed once it has rendered).
class IslandBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false } }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) {
    this.props.container.style.removeProperty('cursor')
    console.error('[islands] section island failed, keeping its server HTML', error)
  }
  render() { return this.state.failed ? null : this.props.children }
}

function RemoveServerNodes({ nodes, container }) {
  React.useLayoutEffect(() => {
    nodes.forEach((n) => n.parentNode?.removeChild(n))
    container.style.removeProperty('cursor')
    container.dataset.dmsIslandLive = ''
  }, [nodes])
  return null
}

function Island({ container, section, group, attributes, format }) {
  const [serverNodes] = React.useState(() => Array.from(container.childNodes))
  const isSpreadsheet = section?.element?.['element-type'] === 'Spreadsheet'
  const [active, setActive] = React.useState(false)
  return createPortal(
    <IslandBoundary container={container}>
      <React.Suspense fallback={null}>
        <div style={{ display: 'contents' }} onClick={isSpreadsheet ? () => setActive(true) : undefined}>
          <SectionView i={0} group={group} value={section} attributes={attributes} format={format}
            isActive={isSpreadsheet ? active : undefined} />
        </div>
        <RemoveServerNodes nodes={serverNodes} container={container} />
      </React.Suspense>
    </IslandBoundary>,
    container,
  )
}

export default function SectionIslands({ islands, awake }) {
  const { page, sections } = islands
  const registry = getRegisteredComponents()
  const cms = React.useContext(CMSContext) || {}
  const { theme } = React.useContext(ThemeContext) || {}
  registerThemeParts(theme)
  const { app, type, baseUrl, falcor } = cms
  const item = page.item

  const format = React.useMemo(() => {
    const f = initializePatternFormat(cmsFormat, app, type)
    if (page.additionalSectionAttributes?.length) {
      const componentFormat = (f.registerFormats || []).find((r) => r.type.includes('component') || r.type.includes('cms-section'))
      componentFormat?.attributes.push(...page.additionalSectionAttributes)
    }
    return f
  }, [app, type, page.additionalSectionAttributes])
  // what SectionArray hands SectionView: the `sections` attribute's ViewComp (getViewComp's array wrapper)
  // passes the attribute itself as `attr`, and SectionView gets `attr.attributes`
  const sectionAttributes = React.useMemo(() => getAttributes(format, {}, 'edit')?.['sections']?.attributes, [format])

  const { pageState, setPageState, updatePageStateFilters, setActionParam, clearActionParam } =
    usePageViewState({ item, patternFilters: page.patternFilters || [], baseUrl, syncUrl: !item?.nav_link })

  // the page state the server rendered with: once it differs, the waiting sections mount too
  const filtersNow = JSON.stringify(pageState.filters || [])
  const [filtersAtFirst] = React.useState(filtersNow)
  const stateChanged = React.useRef(false)
  if (filtersNow !== filtersAtFirst) stateChanged.current = true

  const apiLoad = React.useCallback((config, path) => dmsDataLoader(falcor, config, path || '/'), [falcor])
  const apiUpdate = React.useCallback(({ data, config = { format }, requestType = '' }) =>
    dmsDataEditor(falcor, config, data, requestType), [falcor, format])

  const cmsValue = React.useMemo(() => ({
    ...cms, apiLoad, datasources: page.datasources, pgEnv: page.pgEnv, subdomain: page.subdomain || '', patternFilters: page.patternFilters || [],
  }), [cms, apiLoad, page])
  const pageValue = {
    item, pageState, setPageState, updatePageStateFilters, setActionParam, clearActionParam,
    dataItems: page.dataItems || [], apiLoad, apiUpdate, format, busy: { loading: 0, updating: 0 }, baseUrl,
  }
  const dataSources = React.useMemo(() => ({
    dataSources: item?.dataSources || {}, setDataSource: () => {}, removeDataSource: () => {}, createDataSource: () => {},
  }), [item])

  // the slot elements are in the DOM by now (IslandHost mounts after the slots commit)
  const containers = React.useMemo(() => Object.fromEntries(sections.map(({ key }) =>
    [key, document.querySelector(`[data-dms-island="${key}"]`)])), [sections])

  return (
    <CMSContext.Provider value={cmsValue}>
      <DataSourceContext.Provider value={dataSources}>
        <PageContext.Provider value={pageValue}>
          {sections.map(({ key, index, wake }) => {
            const section = item?.sections?.[index]
            const container = containers[key]
            if (!section || !container) return null
            if (wake && !awake?.has(key) && !stateChanged.current) return null
            // a type nothing registered (its plugin did not load): the server HTML stays
            if (!registry[section.element?.['element-type'] || 'lexical']) return null
            const group = (item?.section_groups || []).find((g) => g.name === (section.group || 'default')) || { name: section.group || 'default' }
            return <Island key={key} container={container} section={section} group={group} attributes={sectionAttributes} format={format} />
          })}
        </PageContext.Provider>
      </DataSourceContext.Provider>
    </CMSContext.Provider>
  )
}
