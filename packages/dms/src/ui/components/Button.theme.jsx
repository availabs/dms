import React from 'react'
import { lexicalTheme } from './lexical/theme'

// The v6 control looks (2026-10-13, planning/tasks/current/ui-control-consistency-audit.md; spec:
// src/themes/tessera/design_system_v6/pages/ui-controls.html). Kept here, with the component — pattern
// themes that need the same look copy the string into their own theme file.
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--t-ink)]';
const BTN = `inline-flex items-center justify-center gap-1.5 rounded-md border whitespace-nowrap cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS}`;
const LINK = `inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS} rounded-sm`;
const CHIP_BASE = `inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border t-metaXS cursor-pointer transition-colors ${FOCUS}`;
const PRIMARY = `${BTN} h-8 px-3.5 t-proseSM font-medium border-[var(--t-ink)] bg-[var(--t-ink)] text-[var(--t-paper)] hover:bg-[var(--t-graphite)] hover:border-[var(--t-graphite)]`;
const ACTION = `${BTN} h-8 px-3 t-proseSM border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`;
const DANGER = `${BTN} h-8 px-3 t-proseSM border-[var(--t-brick)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`;
const DANGER_SOLID = `${BTN} h-8 px-3 t-proseSM font-medium border-[var(--t-brick)] bg-[var(--t-brick)] text-[var(--t-accent-ink)] hover:opacity-90`;
const SMALL = `${BTN} h-6 px-2.5 t-metaXS border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:border-[var(--t-rule-strong)] hover:text-[var(--t-ink)]`;
const SMALL_DANGER = `${BTN} h-6 px-2.5 t-metaXS border-[var(--t-brick)] bg-[var(--t-panel)] text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`;
// amber twin of SMALL_DANGER: leave a warning state (auth ViewAsBar "Exit View As", 2026-10-15)
// 2026-10-15 (datasets raw-HTML pass): a 20px borderless icon that sits inside a text row or a chip (glance edit
// pencil, a category chip's remove ×); the row icons (size-7) are too big there.
const ICON_INLINE_BASE = `inline-flex items-center justify-center size-5 rounded-sm flex-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS}`;
const ICON_INLINE = `${ICON_INLINE_BASE} text-[var(--t-pencil)] hover:text-[var(--t-ink)]`;
const ICON_INLINE_DANGER = `${ICON_INLINE_BASE} text-[var(--t-pencil)] hover:text-[var(--t-brick)]`;
// a link inside running text or a chip: keeps the surrounding font and colour, underline on hover
const LINK_INLINE = `inline cursor-pointer text-inherit [font:inherit] p-0 hover:underline underline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS} rounded-sm`;
const SMALL_WARN = `${BTN} h-6 px-2.5 t-metaXS border-[var(--t-amber)] bg-[var(--t-panel)] text-[var(--t-amber)] hover:bg-[var(--t-amber-soft)]`;
const ICON_TOOL = `${BTN} size-8 border-[var(--t-rule)] bg-[var(--t-panel)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)]`;
const ICON_ROW = `${BTN} size-7 border-transparent text-[var(--t-pencil)] hover:text-[var(--t-ink)] hover:bg-[var(--t-well)]`;
const ICON_ROW_DANGER = `${BTN} size-7 border-transparent text-[var(--t-pencil)] hover:text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`;
const LINK_META = `${LINK} t-metaXS text-[var(--t-pencil)] hover:text-[var(--t-ink)]`;
const LINK_META_DANGER = `${LINK} t-metaXS text-[var(--t-pencil)] hover:text-[var(--t-brick)]`;
const LINK_PROSE = `${LINK} t-proseXS text-[var(--t-graphite)] hover:text-[var(--t-ink)]`;
const CHIP = `${CHIP_BASE} border-[var(--t-rule)] text-[var(--t-graphite)] hover:border-[var(--t-rule-strong)] hover:text-[var(--t-ink)]`;
const CHIP_ON = `${CHIP_BASE} border-[var(--t-ink)] bg-[var(--t-ink)] text-[var(--t-paper)]`;
const ICON_TOOL_ON = `${BTN} size-8 border-[var(--t-ink)] bg-[var(--t-ink)] text-[var(--t-paper)]`;
// Full-width primary submit (auth sign-in / signup / forgot / reset).
const PRIMARY_BLOCK = `${BTN} w-full h-10 px-4 t-proseSM font-medium border-[var(--t-ink)] bg-[var(--t-ink)] text-[var(--t-paper)] hover:bg-[var(--t-graphite)] hover:border-[var(--t-graphite)]`;
// navigableMenu's trigger (section menu ⋯ / ☰): navigableMenu `buttonStyle` names it.
const MENU_TRIGGER = `inline-flex items-center justify-center gap-1.5 px-2 py-1 rounded-md hover:bg-[var(--t-well)] cursor-pointer transition-colors duration-150 ${FOCUS}`;
// Segmented control segments (UI.ButtonSelect 'segmented'): the selected one is ink (spec P1).
const SEGMENT_BASE = `inline-flex items-center justify-center gap-1.5 h-7 px-2.5 rounded t-proseXS cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${FOCUS}`;
const SEGMENT = `${SEGMENT_BASE} text-[var(--t-graphite)] hover:text-[var(--t-ink)]`;
const SEGMENT_ON = `${SEGMENT_BASE} bg-[var(--t-ink)] text-[var(--t-paper)]`;
// icon-only segments (datasets list view switcher) — spec SEG_ICON / SEG_ICON_ON; their own names so a project theme
// can brand its view toggle without touching the text segments
// square icon segments: SEGMENT_BASE without its px-2.5 (a trailing px-0 loses to it in the CSS order)
const SEGMENT_ICON_BASE = SEGMENT_BASE.replace(' px-2.5', '');
const SEGMENT_ICON = `${SEGMENT_ICON_BASE} w-8 text-[var(--t-graphite)] hover:text-[var(--t-ink)]`;
const SEGMENT_ICON_ON = `${SEGMENT_ICON_BASE} w-8 bg-[var(--t-ink)] text-[var(--t-paper)]`;
// Full-width variants are their own names: a caller never adds layout through className.
const ACTION_FULL = `${ACTION} w-full`;
const DANGER_FULL = `${DANGER} w-full`;
// 2026-10-15 (ui-raw-html-to-ui-components.md, admin): roles for the admin's last raw buttons.
// A dropdown menu row (page-actions menu) — the v6 spec's MENU_ROW / MENU_ROW_D (controls.py), in a menu
// panel with p-1; warn is the amber row (Discard).
const MENU_ITEM_BASE = `w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded t-proseSM text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS}`;
const MENU_ITEM = `${MENU_ITEM_BASE} text-[var(--t-ink)] hover:bg-[var(--t-well)]`;
const MENU_ITEM_WARN = `${MENU_ITEM_BASE} text-[var(--t-amber)] hover:bg-[var(--t-amber-soft)]`;
const MENU_ITEM_DANGER = `${MENU_ITEM_BASE} text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)]`;
// A pick-one card (new-site template picker) — the spec's PICK / PICK_ON; content laid out by the children.
const OPTION_CARD_BASE = `text-left flex gap-3 p-3 rounded-lg border bg-[var(--t-panel)] cursor-pointer transition-colors ${FOCUS}`;
const OPTION_CARD = `${OPTION_CARD_BASE} border-[var(--t-rule)] hover:border-[var(--t-rule-strong)]`;
const OPTION_CARD_ON = `${OPTION_CARD_BASE} border-[var(--t-ink)] shadow-[var(--t-shadow-lift)]`;
// A cell of an icon grid (user-menu icon picker).
const ICON_PICK_BASE = `aspect-square flex items-center justify-center rounded cursor-pointer ${FOCUS}`;
const ICON_PICK = `${ICON_PICK_BASE} text-[var(--t-graphite)] hover:bg-[var(--t-well)] hover:text-[var(--t-ink)]`;
const ICON_PICK_ON = `${ICON_PICK_BASE} bg-[var(--t-well)] text-[var(--t-ink)] ring-1 ring-[var(--t-ink)]`;
// A field-shaped button that opens a picker (user-menu icon field).
const FIELD_TRIGGER = `inline-flex items-center gap-2 bg-[var(--t-panel)] border border-[var(--t-rule)] hover:border-[var(--t-rule-strong)] aria-expanded:border-[var(--t-ink)] rounded-md pl-2 pr-2.5 py-1.5 cursor-pointer ${FOCUS}`;
// A row title that is a link (activity feed page title).
// block, not LINK's inline-flex, so a long title ellipsises
const LINK_TITLE = `block max-w-full min-w-0 truncate text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS} rounded-sm t-proseSM font-medium text-[var(--t-ink)] hover:text-[var(--t-cobalt)]`;

// ── page-pattern raw-HTML pass (2026-10-16, ui-raw-html-to-ui-components.md "Page pattern"). Strings copied from the
// default theme's current pattern keys (named in each comment) so the default look doesn't move.
// ColumnManager eye / group toggles (toggleBtn + toggleOn) and its stale-column warning (staleBtn)
const ICON_INLINE_ON = `${ICON_INLINE_BASE} text-[var(--t-ink)] hover:bg-[var(--t-well)]`;
const ICON_INLINE_WARN = `${ICON_INLINE_BASE} text-[var(--t-amber)] hover:bg-[var(--t-well)]`;
// a button that is only a container (layout thumbnail, filter disclosure row, collapse header): behaviour + focus,
// no look; its layout lives on an inner span the caller themes
const BARE = `cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS}`;
// editPanes iconTile / iconTileActive: the 44px page-icon tile in the settings pane
const ICON_TILE_BASE = `relative size-11 flex-none rounded-lg border bg-[var(--t-well)] text-[var(--t-ink)] flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS}`;
const ICON_TILE = `${ICON_TILE_BASE} border-[var(--t-rule)] hover:border-[var(--t-rule-strong)]`;
const ICON_TILE_ON = `${ICON_TILE_BASE} border-[var(--t-ink)]`;
// editPane discardBtn / publishBtn (+ publishBtnDisabled as the disabled state): the dark edit bar (page-edit.html)
const BOARD_GHOST = `h-9 px-3 rounded-lg t-proseSM text-[var(--t-chalk)] hover:bg-[var(--t-board-2)] cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${FOCUS}`;
const BOARD_PRIMARY = `h-9 px-4 rounded-lg t-proseSM font-medium text-[var(--t-board)] bg-[var(--t-chalk)] hover:opacity-90 cursor-pointer whitespace-nowrap disabled:font-normal disabled:bg-transparent disabled:text-[var(--t-chalk-dim)] disabled:border disabled:border-[var(--t-board-2)] disabled:hover:opacity-100 disabled:cursor-not-allowed ${FOCUS}`;
// section menu action row "copied" state (section.theme menuActionBtn + menuActionBtnDone): a go-coloured row icon
const ICON_ROW_GO = `${BTN} size-7 border-transparent text-[var(--t-go)] hover:text-[var(--t-go)] hover:bg-[var(--t-well)]`;
// sectionGroup navItem / navItemActive: in-page nav rail rows (visitor-facing; project themes lift their own)
const NAV_RAIL = `block w-full text-left -ml-px pl-3 py-1 border-l-2 border-transparent t-proseSM text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer transition-colors ${FOCUS}`;
const NAV_RAIL_ON = `block w-full text-left -ml-px pl-3 py-1 border-l-2 border-[var(--t-ink)] t-proseSM font-medium text-[var(--t-ink)] cursor-pointer ${FOCUS}`;
// searchButton.button minus its `mx-3 mt-4` (layout → the caller's wrapper): the search-modal trigger
const SEARCH_TRIGGER = `flex items-center gap-2 h-8 px-3 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] hover:border-[var(--t-rule-strong)] transition-colors cursor-pointer ${FOCUS}`;
// filters toggleChip (+ toggleChipOn ''): the external-filter switch container (track / knob are inner spans)
const TOGGLE = `group inline-flex items-center gap-2 cursor-pointer select-none ${FOCUS} rounded-sm`;

// ── ui composites raw-HTML pass (2026-10-17, ui-raw-html-to-ui-components.md "UI composites"). Each string is the
// composite's own former theme key (named in the comment), copied 1:1 so no theme's look moves; a project theme's
// own key is lifted into a style of its own (src/themes/_legacy/ui.js liftPatternRoles).
// drawer.closeButton
const DRAWER_CLOSE = 'relative rounded-md text-[var(--t-pencil)] hover:text-[var(--t-ink)] cursor-pointer focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--t-ink)]';
// themeToggle.button
const THEME_TOGGLE = 'w-8 h-8 shrink-0 rounded-md border border-[var(--t-rule)] flex items-center justify-center text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer transition-colors duration-150';
// topnav.mobileButton
const NAV_MOBILE = 'lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-md border border-[var(--t-rule)] text-[var(--t-graphite)] hover:text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer transition-colors duration-150';
// deleteModal.cancelButton / deleteButton
const MODAL_CANCEL = 'h-8 inline-flex items-center px-3 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] t-proseSM text-[var(--t-ink)] hover:border-[var(--t-rule-strong)] cursor-pointer';
const MODAL_DELETE = 'h-8 inline-flex items-center px-3 rounded-md t-proseSM font-medium text-[var(--t-accent-ink)] bg-[var(--t-brick)] hover:opacity-90 disabled:opacity-40 cursor-pointer';
// permissions.inheritedAction / inheritedActionQuiet
const PERM_INHERITED = 't-proseXS text-[var(--t-amber)] hover:underline cursor-pointer';
const PERM_INHERITED_QUIET = 't-proseXS text-[var(--t-graphite)] underline decoration-dotted cursor-pointer';
// table addRowButton / inlineAddSave / inlineAddSaveFloating / actionDeleteBtn / actionsMenuTrigger / actionsMenuItemDanger
const TABLE_ADD_ROW = 'w-fit h-fit rounded-md text-[var(--t-graphite)] hover:text-[var(--t-ink)] cursor-pointer';
const TABLE_ADD_SAVE = 'flex items-center justify-center text-[var(--t-go)] hover:text-[var(--t-ink)] cursor-pointer';
const TABLE_ADD_SAVE_FLOATING = 'absolute top-1/2 right-2 -translate-y-1/2 z-10 bg-[var(--t-ink)] hover:opacity-90 text-[var(--t-paper)] rounded text-xs px-1.5 py-0.5 shadow cursor-pointer';
const TABLE_ROW_DELETE = 'w-fit p-0.5 mx-0.5 rounded-md text-[var(--t-pencil)] hover:text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] cursor-pointer';
const TABLE_ACTIONS_TRIGGER = 'flex items-center justify-center w-full h-full cursor-pointer';
// BarGraph scale filter options: the literals the control hardcoded (scaleFilterItem + Inactive / Active)
const SCALE_FILTER = 'font-semibold px-2 py-1 cursor-pointer select-none text-xs text-gray-500 hover:text-gray-700';
const SCALE_FILTER_ON = 'font-semibold px-2 py-1 cursor-pointer select-none text-xs text-blue-600';
// treeNode column type's expand / collapse caret (its hardcoded classes; already on tokens, 18px so rows don't move)
const TREE_CARET = 'w-[18px] h-[18px] rounded flex-shrink-0 inline-flex items-center justify-center text-[var(--t-pencil)] hover:bg-[var(--t-well)] hover:text-[var(--t-graphite)] text-[10px] cursor-pointer border-none bg-transparent';
// Colorpicker swatches — v6 2026-10-17 (ui-controls.html#color-picker): the section menu's swatch grid cell, the theme's
// rule as an edge so pale colours read, the chosen one ink-ringed; the fill is the caller's inline backgroundColor.
// swatchFlat(On) are the same look (both picker forms share it); pre-v6 strings: src/themes/_legacy/ui.js APPEND_LITERALS.
const SWATCH = `h-6 rounded-md border border-[var(--t-rule)] cursor-pointer ${FOCUS}`;
const SWATCH_ON = `${SWATCH} ring-2 ring-[var(--t-ink)] ring-offset-1 ring-offset-[var(--t-panel)]`;
// the Lexical plugin dialogs' close ✕ (useModal; its fallback when the theme has no modal.closeButton)
const LEX_MODAL_CLOSE = 'cursor-pointer text-sm hover:opacity-70';
// the Lexical editor's controls: composed from the library lexical theme's own class keys (lexical/theme.js), so
// each role is exactly what that control rendered
const LX = lexicalTheme.styles[0];
const lx = (...keys) => keys.map(k => LX[k]).filter(Boolean).join(' ');
const TABLE_ACTIONS_DELETE = 'flex items-center gap-2 px-2 py-1.5 t-proseSM text-[var(--t-brick)] hover:bg-[var(--t-brick-soft)] rounded cursor-pointer whitespace-nowrap w-full text-left';

export const buttonTheme = {
  options: {
    activeStyle:0
  },
  styles: [
    {
      // v6 (2026-10-13, ui-control-consistency-audit.md P1): the bare UI.Button is the ink primary —
      // the same role every unstyled button had (it was solid cobalt). Secondary buttons opt into
      // activeStyle='action' page by page. Project themes keep the old cobalt via src/themes/_legacy/ui.js.
      name: 'default Buttons',
      button: PRIMARY,
    },
    {
      name:'plain',
      button: `cursor-pointer relative isolate inline-flex items-center justify-center gap-x-2 rounded-lg border text-base/6 font-semibold  sm:text-sm/6 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 [&>[data-slot=icon]]:-mx-0.5 [&>[data-slot=icon]]:my-0.5 [&>[data-slot=icon]]:size-5 [&>[data-slot=icon]]:shrink-0 [&>[data-slot=icon]]:text-[--btn-icon] [&>[data-slot=icon]]:sm:my-1 [&>[data-slot=icon]]:sm:size-4 forced-colors:[--btn-icon:ButtonText] forced-colors:hover:[--btn-icon:ButtonText] border-transparent text-zinc-950 active:bg-zinc-950/5 hover:bg-zinc-950/5 dark:text-white dark:active:bg-white/10 dark:hover:bg-white/10 [--btn-icon:theme(colors.zinc.500)] active:[--btn-icon:theme(colors.zinc.700)] hover:[--btn-icon:theme(colors.zinc.700)] dark:[--btn-icon:theme(colors.zinc.500)] dark:active:[--btn-icon:theme(colors.zinc.400)] dark:hover:[--btn-icon:theme(colors.zinc.400)] cursor-default
      rounded-lg
      px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]
      `
    },
    {
      name: 'active',
      // 3D press effect via box-shadow (not asymmetric border) so the button's
      // content box matches the default style — both buttons share identical
      // padding and borders, keeping text aligned across styles.
      button: `cursor-pointer inline-flex items-center justify-center gap-2 text-sm/6 font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-all shadow-[0_3px_0_#1e40af] hover:shadow-[0_3px_0_#1d4ed8] active:shadow-none active:translate-y-[3px] focus:outline-none focus-visible:outline-1 focus-visible:outline-white
      rounded-lg
      px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing.3)-1px)] sm:py-[calc(theme(spacing[1.5])-1px)]
      `,
    },
    // ── named styles (2026-10-13) — the v6 looks defined at the top of this file; pick with activeStyle='<name>'.
    // Appended after 'plain' / 'active' so stored style indices don't move.
    { name: 'primary',        button: PRIMARY },
    { name: 'action',         button: ACTION },
    { name: 'danger',         button: DANGER },
    { name: 'dangerSolid',    button: DANGER_SOLID },
    { name: 'small',          button: SMALL },
    { name: 'smallDanger',    button: SMALL_DANGER },
    { name: 'iconTool',       button: ICON_TOOL },
    { name: 'iconRow',        button: ICON_ROW },
    { name: 'iconRowDanger',  button: ICON_ROW_DANGER },
    { name: 'linkMeta',       button: LINK_META },
    { name: 'linkMetaDanger', button: LINK_META_DANGER },
    { name: 'linkProse',      button: LINK_PROSE },
    { name: 'chip',           button: CHIP },
    { name: 'chipOn',         button: CHIP_ON },
    { name: 'iconToolOn',     button: ICON_TOOL_ON },
    { name: 'actionFull',     button: ACTION_FULL },
    { name: 'dangerFull',     button: DANGER_FULL },
    { name: 'segment',        button: SEGMENT },
    { name: 'segmentOn',      button: SEGMENT_ON },
    { name: 'primaryBlock',   button: PRIMARY_BLOCK },
    { name: 'menuTrigger',    button: MENU_TRIGGER },
    // ── Map editor + TransportNY component buttons (2026-10-13). On the default theme each is the v6 role
    // named in its comment; project themes keep these buttons' pre-lock look (src/themes/_legacy/ui.js).
    { name: 'primaryMd',       button: PRIMARY },        // primary
    { name: 'primarySm',       button: PRIMARY },        // primary
    { name: 'ghostMd',         button: PRIMARY },        // primary (a confirm that is idle until enabled)
    { name: 'dangerMd',        button: DANGER_SOLID },   // dangerSolid
    { name: 'dangerSm',        button: DANGER_SOLID },   // dangerSolid
    { name: 'cancelMd',        button: ACTION },         // action
    { name: 'cancelSm',        button: ACTION },         // action
    { name: 'ghostSm',         button: ACTION },         // action
    { name: 'primaryXs',       button: SMALL },          // small
    { name: 'dangerXs',        button: SMALL_DANGER },   // smallDanger
    { name: 'bareIcon',        button: ICON_ROW },       // iconRow
    { name: 'bareIconBox',     button: ICON_ROW },       // iconRow
    { name: 'barePrimaryFull', button: PRIMARY_BLOCK },  // primaryBlock
    { name: 'bareActionFull',  button: ACTION_FULL },    // actionFull
    // ── admin's last raw buttons (2026-10-15, ui-raw-html-to-ui-components.md); appended so indices don't move
    { name: 'menuItem',       button: MENU_ITEM },
    { name: 'menuItemWarn',   button: MENU_ITEM_WARN },
    { name: 'menuItemDanger', button: MENU_ITEM_DANGER },
    { name: 'optionCard',     button: OPTION_CARD },
    { name: 'optionCardOn',   button: OPTION_CARD_ON },
    { name: 'iconPick',       button: ICON_PICK },
    { name: 'iconPickOn',     button: ICON_PICK_ON },
    { name: 'fieldTrigger',   button: FIELD_TRIGGER },
    { name: 'linkTitle',      button: LINK_TITLE },
    { name: 'smallWarn',      button: SMALL_WARN },
    // ── datasets raw-HTML pass (2026-10-15); appended so indices don't move
    { name: 'iconInline',       button: ICON_INLINE },
    { name: 'iconInlineDanger', button: ICON_INLINE_DANGER },
    { name: 'segmentIcon',      button: SEGMENT_ICON },
    { name: 'segmentIconOn',    button: SEGMENT_ICON_ON },
    { name: 'linkInline',       button: LINK_INLINE },
    // ── page-pattern raw-HTML pass (2026-10-16); appended so indices don't move. navRail(On) / searchTrigger /
    // toggle(On) / groupModalClose: project themes get their own look lifted from their pattern keys
    // (src/themes/_legacy/ui.js liftPatternRoles).
    { name: 'iconInlineOn',     button: ICON_INLINE_ON },
    { name: 'iconInlineWarn',   button: ICON_INLINE_WARN },
    { name: 'bare',             button: BARE },
    { name: 'iconTile',         button: ICON_TILE },
    { name: 'iconTileOn',       button: ICON_TILE_ON },
    { name: 'boardGhost',       button: BOARD_GHOST },
    { name: 'boardPrimary',     button: BOARD_PRIMARY },
    { name: 'iconRowGo',        button: ICON_ROW_GO },
    { name: 'navRail',          button: NAV_RAIL },
    { name: 'navRailOn',        button: NAV_RAIL_ON },
    { name: 'searchTrigger',    button: SEARCH_TRIGGER },
    { name: 'toggle',           button: TOGGLE },
    { name: 'toggleOn',         button: TOGGLE },
    { name: 'groupModalClose',  button: ICON_ROW },
    // ── ui composites raw-HTML pass (2026-10-17); appended so indices don't move. Project themes with their own
    // composite key get it lifted (src/themes/_legacy/ui.js liftPatternRoles).
    { name: 'drawerClose',          button: DRAWER_CLOSE },
    { name: 'themeToggle',          button: THEME_TOGGLE },
    { name: 'navMobile',            button: NAV_MOBILE },
    { name: 'modalCancel',          button: MODAL_CANCEL },
    { name: 'modalDelete',          button: MODAL_DELETE },
    { name: 'permInherited',        button: PERM_INHERITED },
    { name: 'permInheritedQuiet',   button: PERM_INHERITED_QUIET },
    { name: 'tableAddRow',          button: TABLE_ADD_ROW },
    { name: 'tableAddSave',         button: TABLE_ADD_SAVE },
    { name: 'tableAddSaveFloating', button: TABLE_ADD_SAVE_FLOATING },
    { name: 'tableRowDelete',       button: TABLE_ROW_DELETE },
    { name: 'tableActionsTrigger',  button: TABLE_ACTIONS_TRIGGER },
    { name: 'tableActionsDelete',   button: TABLE_ACTIONS_DELETE },
    { name: 'scaleFilter',          button: SCALE_FILTER },
    { name: 'scaleFilterOn',        button: SCALE_FILTER_ON },
    { name: 'treeCaret',            button: TREE_CARET },
    { name: 'lexModalClose',        button: LEX_MODAL_CLOSE },
    { name: 'lexFormatItem',        button: lx('floatingTextFormatPopup_popupItem_base', 'floatingTextFormatPopup_popupItem_spaced') },
    { name: 'lexFormatItemOn',      button: lx('floatingTextFormatPopup_popupItem_base', 'floatingTextFormatPopup_popupItem_spaced', 'floatingTextFormatPopup_popupItem_active') },
    { name: 'lexToolbarItem',       button: lx('toolbar_toolbarItem_base', 'toolbar_toolbarItem_spaced') },
    { name: 'lexToolbarItemPlain',  button: lx('toolbar_toolbarItem_base') },
    { name: 'lexToolbarCode',       button: lx('toolbar_toolbarItem_base', 'toolbar_codeLanguage') },
    { name: 'lexDropdownItem',      button: lx('dropdown_item_base') },
    { name: 'lexDropdownItemOn',    button: lx('dropdown_item_base', 'dropdownItemActive') },
    { name: 'lexFontItemOn',        button: lx('toolbar_toolbarItem_base', 'dropdownItemActive') },
    { name: 'lexTableAddRows',      button: lx('tableAddRows') },
    { name: 'lexTableAddColumns',   button: lx('tableAddColumns') },
    { name: 'lexImageCaption',      button: lx('editor_image_captionButton') },
    { name: 'lexImageEdit',         button: lx('editor_inlineImage_editButton_base') },
    { name: 'lexActionButton',      button: lx('actionButton_base') },
    { name: 'swatch',               button: SWATCH },
    { name: 'swatchOn',             button: SWATCH_ON },
    { name: 'swatchFlat',           button: SWATCH },
    { name: 'swatchFlatOn',         button: SWATCH_ON },
  ]
}

export const buttonSettings = (theme) => [
  {
    label: "Button Styles",
    type: 'inline',
    controls: [
      {
        label: 'Style',
        type: 'MultiSelect',
        singleSelectOnly: true,
        searchable: false,
        options: (theme?.button?.styles || [{}])
          .map((k, i) => ({ label: k?.name || i, value: i })),
        path: `button.options.activeStyle`,
      },
      {
        label: 'Add Style',
        type: 'Button',
        children: <div>Add Style</div>,
        onClick: (e, setState) => {
          setState(draft => {
            draft.button.styles.push({ ...draft.button.styles[0], name: 'new style', })

          })
        }
      },
      {
        label: 'Remove Style',
        type: 'Button',
        children: <div>Remove Style</div>,
        //disabled:
        onClick: (e, setState) => {
          setState(draft => {
            if (draft.button.styles.length > 1) {
              draft.button.styles.splice(theme.button.options.activeStyle, 1)
              draft.button.options.activeStyle = 0
            }
          })
        }
        //path: `sidenav.styles[${activeStyle}].outerWrapper`,
      },
    ]
  },
  {
    label: "Button",
    type: 'inline',
    controls: [
      ...Object.keys(theme?.button?.styles?.[theme?.button?.options?.activeStyle || 0] || {} )
        .map(k => {
          return {
            label: k,
            type: 'Textarea',
            path: `button.styles[${theme?.button?.options?.activeStyle || 0}].${k}`
          }
        })
    ]
  }
]

export const docs = [
  {type: 'default', children: 'Button', doc_name: 'Default Button'},
  {type: 'plain', children: 'Button', doc_name: 'Plain Button'},
  {type: 'active', children: 'Button', doc_name: 'Active Button'},
  {type: 'inactive', children: 'Button', doc_name: 'Inactive Button'},
]
