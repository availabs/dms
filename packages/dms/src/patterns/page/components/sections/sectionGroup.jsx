import React from 'react'
import { Link, useLocation } from 'react-router'
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import { PageContext, CMSContext } from '../../context'
import { getInPageNav } from '../../pages/_utils'
import { appendHistoryEntry } from '../../../utils'

import SectionArray from './sectionArray'
import InPageNav from './InPageNav'
import { sectionGroupTheme } from './sectionGroup.theme'

export default function SectionGroup ({group, attributes, edit}) {
  const { theme,  UI } = React.useContext(ThemeContext);
  const { user } = React.useContext(CMSContext) || {};

  const { apiUpdate, item, updateAttribute, pageState, clearActionParam } = React.useContext(PageContext);
  const { LayoutGroup, Modal } = UI;

  // group.theme also selects this band's `pages.sectionGroup` rail style (in addition
  // to its `layoutGroup` style above) — an unmatched/undefined value safely falls back
  // to styles[0], so this is a no-op for every band that doesn't opt into a named style.
  const t = { ...sectionGroupTheme, ...getComponentTheme(theme, 'pages.sectionGroup', group.theme) }
  const inPageNav = getInPageNav(item, theme, edit)
  const styleIndex = theme.layoutGroup.styles.map(d => d.name).indexOf(group.theme || 'default')
  const activeStyle =  styleIndex === -1 ? 0 : styleIndex
  const sectionAttributes =  attributes?.['sections']?.attributes

  // ── Rail attachment (Phase 6) ──
  // Attach the rail to the band that actually holds the nav sections — i.e. the
  // group of the first section carrying a `navLabel`. This is self-locating and
  // robust to pages whose bands are all position:'content' (the bands differ only
  // by `theme`), where "first content group" would wrongly land on a header band.
  // Fallback to the legacy `'default'` group so existing docs pages (title/level-1
  // nav, content in the `default` group) keep attaching exactly where they did.
  const groupSource = (edit ? item?.draft_section_groups : item?.section_groups) || []
  const sectionSource = (edit ? item?.draft_sections : item?.sections) || []
  // Attach the rail to the band holding the nav sections; with no navLabels yet,
  // fall back to the first content band, then the legacy 'default' name — so the
  // rail renders as soon as `item.sidebar` is on, even before any navLabel is set.
  const contentBands = groupSource
      .filter(g => (g?.position || 'content') === 'content')
      .sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0))
  // A band may opt in explicitly as the rail host (`railHost: true`) — this wins over
  // the navLabel/first-content-band heuristics, letting pages whose first content band
  // is a header/breadcrumb (not the main content) anchor the rail on the right band.
  const railGroupName = groupSource.find(g => g?.railHost)?.name
      || sectionSource.find(s => s?.navLabel)?.group
      || contentBands[0]?.name
      || 'default'
  const showRail = Boolean(item?.sidebar) && group.name === railGroupName
  // `item.sidebarHideInView`: an opt-in page flag for rail content that self-hides in
  // view mode (e.g. ReportRouteList, which returns null outside /edit/... EXCEPT for
  // its own entry-gate modal for Dynamic Reports — see ReportRouteList/README.md's
  // "View-mode visibility"). This must NOT prevent the rail from mounting — RRL still
  // needs to mount so it can render that modal when it's needed. So this only collapses
  // the wrapper's WIDTH/CHROME via CSS, once RRL has signaled it has nothing to show;
  // the modal itself is a `createPortal(..., document.body)` (see ui/components/
  // Modal.jsx), so it's fully visible regardless of this wrapper's own CSS. A JS-level
  // `showRail &&` gate here (tried first, reverted) would stop RRL from mounting at all
  // outside edit mode — silently swallowing the entry gate exactly like the generic
  // `hideInView` flag already did once (see dynamic-reports-and-route-tags.md).
  //
  // `:has(...:empty)` was tried second and doesn't work either: SectionArrayComp/
  // dataWrapper always emit real wrapper markup (grid + padding divs) around whatever a
  // section returns, so the rail's DOM is never actually `:empty` even when its content
  // renders bare `null` — confirmed live, Ryan caught it (blank white rail on a
  // real resolved Dynamic Report, 2026-08-06). Looking for an explicit,
  // deliberately-rendered `.dms-rail-collapsed` marker (which `:has()` finds at any
  // depth, regardless of the scaffolding in between) is what actually works — RRL
  // renders that marker instead of bare `null` when it has nothing to show.
  const collapseRailIfEmpty = Boolean(item?.sidebarHideInView) && !edit
  // The sidebar group (rail content): its sections render in the rail below the nav.
  // position:'sidebar' keeps it out of the top/content/bottom band renders. New pages
  // are seeded with this group (theme scaffold); synthesize one for pages that predate
  // it so the rail always has an author-reachable content area.
  const sidebarGroup = groupSource.find(g => g?.position === 'sidebar' || g?.name === 'sidebar')
      || { name: 'sidebar', position: 'sidebar', index: 99, theme: 'content' }
  const SectionArrayComp = React.useMemo(() => {
      return edit ?
        ( attributes?.['sections']?.EditComp || SectionArray?.EditComp ) :
        ( attributes?.['sections'].ViewComp || SectionArray?.ViewComp )
  }, [])

  const isModal = group.isModal && !edit;
  const modalParamKey = group.modalParamKey;
  // group.modalSize picks the modal card's max-width (default: the historical max-w-4xl).
  // Whitelist map, not `max-w-${size}` — Tailwind only generates classes it can see as literals.
  const modalWidthClass = {
    sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl',
    '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', '5xl': 'max-w-5xl',
  }[group.modalSize] || 'max-w-4xl';
  const isOpen = isModal
      ? (pageState?.filters?.some(f => f.searchKey === modalParamKey && f.type === 'action' && f.values?.[0] !== undefined))
      : true;

  if (isModal && !isOpen) return null;
  if (isModal) {
      // return (
      //     <Modal open={isModal && isOpen} setOpen={() => clearActionParam(modalParamKey)}>
      //         <SectionArrayComp
      //             group={group}
      //             value={item?.['sections'] || [] }
      //             attr={sectionAttributes}
      //             onChange={(update, action) => updateSections({update, action, item, user, apiUpdate, updateAttribute})}
      //         />
      //     </Modal>
      // );
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        onClick={() => clearActionParam(modalParamKey)}
      >
        <div
          className={`relative bg-white rounded-lg shadow-xl w-full ${modalWidthClass} mx-4 max-h-[90vh] overflow-y-auto`}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="sticky float-right top-3 right-3 text-gray-400 hover:text-gray-700 z-10 text-xl leading-none"
            onClick={() => clearActionParam(modalParamKey)}
          >✕</button>
          <SectionArrayComp
            group={group}
            value={item?.['sections'] || [] }
            attr={sectionAttributes}
            onChange={(update, action) => updateSections({update, action, item, user, apiUpdate, updateAttribute})}
          />
        </div>
      </div>
    );
  }

  // The band's main content (this group's sections).
  const mainSections = (
    <SectionArrayComp
      group={group}
      value={sectionSource}
      attr={sectionAttributes}
      onChange={(update, action ) => updateSections({update, action, item, user, apiUpdate, updateAttribute})}
    />
  )

  // The sticky in-page-nav rail: the generated nav + any sidebar-group sections.
  // Rendered INSIDE the band content (not as the LayoutGroup's outerChildren) so
  // the content↔rail two-column layout is owned entirely by the pages theme
  // (`pages.sectionGroup.contentRow/contentCol/sideNavContainer*`) — no reliance
  // on the shared layoutGroup wrapper being flex. `order` flips the rail side.
  const rail = (
    <div className={`${t.sideNavContainer1} ${item?.sidebar === 'left' ? '' : 'order-2'}${collapseRailIfEmpty ? ' has-[.dms-rail-collapsed]:hidden!' : ''}`}>
      <div className={t.sideNavContainer2}>
        <div className={t.sideNavContainer3}>
          <InPageNav menuItems={inPageNav.menuItems} />
          {sidebarGroup ? (
            <SectionArrayComp
              group={sidebarGroup}
              value={sectionSource}
              attr={sectionAttributes}
              onChange={(update, action) => updateSections({update, action, item, user, apiUpdate, updateAttribute})}
            />
          ) : null}
        </div>
      </div>
    </div>
  )

  return (
    <LayoutGroup activeStyle={ activeStyle }>
      {showRail ? (
        <div className={t.contentRow}>
          <div className={`${t.contentCol} ${item?.sidebar === 'left' ? 'order-2' : ''}`}>
            {mainSections}
          </div>
          {rail}
        </div>
      ) : mainSections}
    </LayoutGroup>
  )
}


const updateSections = async ({update, action, item, user, apiUpdate, updateAttribute}) => {
    // const headerSection = item['draft_sections']?.filter(d => d.is_header)?.[0]
    const history = action
      ? appendHistoryEntry(item.history, action, user)
      : (item.history || {})

    //Testing here
    if(updateAttribute) {
      updateAttribute('','',{
        'has_changes': true,
        'history': history,
        'draft_sections': update.filter(d => d)
      })
    }

    // ----------------
    // only need to send id, and data to update, not whole
    // --------------------
    const newItem = {
      id: item?.id,
      draft_sections: update.filter(d => d),
      has_changes: true,
      history,
    }
    //console.log('editFunction saveSection newItem',newItem, update)
    await apiUpdate({data: newItem, skipNavigate: true})
}
