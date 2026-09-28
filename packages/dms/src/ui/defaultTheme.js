// Note: component docs (ui/docs.js) are NOT imported here to avoid circular import:
// defaultTheme -> docs -> view.doc -> view -> useTheme -> defaultTheme
// Consumers that need docs should import ui/docs.js directly (see themeEditor.jsx).
import settings from './themeSettings'
import sideNavTheme from "./components/SideNav.theme";
import topNavTheme from "./components/TopNav.theme";
import layoutTheme  from './components/Layout.theme'
import defaultWidgets from './widgets'
import { layoutGroupTheme } from './components/LayoutGroup.theme';
import {tabsTheme} from "./components/Tabs.theme";
import {buttonTheme} from "./components/Button.theme";
import {inputTheme} from "./components/Input.theme";
import iconTheme from "./components/Icon.theme";
import {fieldTheme} from "./components/FieldSet.theme";
import {dialogTheme} from "./components/Dialog.theme";
import {dialogActionsTheme} from "./components/DialogActions.theme";
import {modalTheme} from "./components/Modal.theme";
import {labelTheme} from "./components/Label";
import {pillTheme} from "./components/Pill.theme";
import {permissionsTheme} from "./components/Permissions.theme";
import {multiselectTheme} from "./components/MultiSelect.theme";
import {tableTheme} from "./components/table/table.theme";
import {nestableTheme} from "./components/draggableNav"
import {dataCardTheme} from "./components/card.theme";
import {logoTheme} from "./components/Logo.theme";
import {themeToggleTheme} from "./components/ThemeToggle.theme";
import navigableMenuTheme from "./components/navigableMenu/theme";
import {mapTheme} from "./components/map/map.theme";
import icons from './icons'
import { textSettingsTheme } from "./themes/textSettings";
import { lexicalTheme } from './components/lexical/theme';
import { nestableInHouseTheme } from "./components/nestableInHouse";
import { defaultPageTemplates } from './pageTemplates';
import { defaultSiteTemplates } from './siteTemplates';
// =========================================
// Pattern Themes, maybe move registration of these to DMS Site ??
// =========================================
import pagesTheme from "../patterns/page/defaultTheme"
import datasetsTheme from "../patterns/datasets/defaultTheme"
import authTheme from "../patterns/auth/defaultTheme"
import adminPatternTheme from "../patterns/admin/defaultTheme"

import { avlGraphTheme } from "./components/graph_new/theme"

// The CSS custom properties + type-token classes every ported default
// component style (button/input/dialog/card/layout/etc.) now references via
// var(--t-*) / .t-* — see planning/tasks/current/tessera-component-theme-port.md.
// Duplicated (not imported) from src/themes/tessera/design_system_v6/_shared.css
// sections 2+4 — the library can't depend on the outer repo's src/themes/.
// Deliberately excludes that file's decorative brand chrome (drafting-sheet
// grain/hatch/joints, sections 3+5) — those are specific to the design-system
// docs pages, not something every unthemed project should inherit. The
// IBM Plex webfont itself IS loaded (2026-09-17): tessera_v6 is this
// library's own default look now, not a placeholder standing in for some
// other project's brand, so the unbranded/default path should render with
// its real typeface — same as every named theme already does. Font-family
// declarations keep their system-font fallbacks regardless, so a slow/blocked
// font load never breaks layout.
const fonts = [
  {
    type: 'google',
    href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Caveat:wght@500;600;700&display=swap',
  },
  {
    type: 'style',
    id: 'dms-default-tokens',
    content: `
      :root {
        --t-paper:    #F6F5F0;
        --t-panel:    #FFFFFF;
        --t-well:     #EFEEE6;
        --t-ink:      #181A1F;
        --t-graphite: #50545C;
        --t-pencil:   #8F929A;
        --t-rule:     #E2E0D6;
        --t-rule-strong: #C9C6B8;
        --t-cobalt:   #0A46D8;
        --t-cobalt-deep: #0836A8;
        --t-accent-ink: #FFFFFF;
        --t-marker:   #FFE84A;
        --t-go:       #1F8A4C;
        --t-amber:    #B97516;
        --t-brick:    #CA3214;
        --t-board:    #15171C;
        --t-board-2:  #1E2128;
        --t-chalk:    #E9EAEE;
        --t-chalk-dim:#9BA0AB;

        --t-cobalt-soft: rgba(10, 70, 216, 0.08);
        --t-cobalt-line: rgba(10, 70, 216, 0.35);
        --t-marker-soft: rgba(255, 232, 74, 0.55);
        --t-go-soft:     rgba(31, 138, 76, 0.10);
        --t-amber-soft:  rgba(185, 117, 22, 0.10);
        --t-brick-soft:  rgba(202, 50, 20, 0.09);
        --t-scrim:       rgba(24, 26, 31, 0.45);

        --t-grid: rgba(24, 26, 31, 0.05);
        --t-pattern: rgba(24, 26, 31, 0.16);

        --t-shadow-lift: 0 1px 2px rgba(24, 26, 31, 0.05);
        --t-shadow-drag: 0 12px 28px rgba(24, 26, 31, 0.18), 0 2px 6px rgba(24, 26, 31, 0.10);
        color-scheme: light;
      }

      [data-theme="dark"] {
        --t-paper:    #131417;
        --t-panel:    #1B1D23;
        --t-well:     #17181D;
        --t-ink:      #EDEDE7;
        --t-graphite: #A8ABB4;
        --t-pencil:   #6B6F78;
        --t-rule:     #2A2D34;
        --t-rule-strong: #3B3F49;
        --t-cobalt:   #7B9CFF;
        --t-cobalt-deep: #9AB4FF;
        --t-accent-ink: #0E1015;
        --t-marker:   #F5D90A;
        --t-go:       #4CC38A;
        --t-amber:    #F0B354;
        --t-brick:    #F2665A;
        --t-board:    #0C0D10;
        --t-board-2:  #16181D;
        --t-chalk:    #E9EAEE;
        --t-chalk-dim:#9BA0AB;

        --t-cobalt-soft: rgba(123, 156, 255, 0.12);
        --t-cobalt-line: rgba(123, 156, 255, 0.40);
        --t-marker-soft: rgba(245, 217, 10, 0.28);
        --t-go-soft:     rgba(76, 195, 138, 0.12);
        --t-amber-soft:  rgba(240, 179, 84, 0.12);
        --t-brick-soft:  rgba(242, 102, 90, 0.12);
        --t-scrim:       rgba(0, 0, 0, 0.60);

        --t-grid: rgba(237, 237, 231, 0.045);
        --t-pattern: rgba(237, 237, 231, 0.14);

        --t-shadow-lift: 0 1px 2px rgba(0, 0, 0, 0.40);
        --t-shadow-drag: 0 12px 28px rgba(0, 0, 0, 0.55), 0 2px 6px rgba(0, 0, 0, 0.35);
        color-scheme: dark;
      }

      .t-displayHero { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 64px; line-height: 1.05; font-weight: 600; letter-spacing: -0.03em; }
      .t-displayXL   { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 44px; line-height: 1.08; font-weight: 600; letter-spacing: -0.025em; }
      .t-displayLG   { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 30px; line-height: 1.15; font-weight: 600; letter-spacing: -0.02em; }
      .t-displayMD   { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 22px; line-height: 1.25; font-weight: 600; letter-spacing: -0.015em; }
      .t-displaySM   { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 17px; line-height: 1.35; font-weight: 600; letter-spacing: -0.01em; }

      .t-proseLG { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 18.5px; line-height: 1.6;  font-weight: 400; letter-spacing: -0.006em; }
      .t-prose   { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 16px;   line-height: 1.65; font-weight: 400; }
      .t-proseSM { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 14px;   line-height: 1.55; font-weight: 400; }
      .t-proseXS { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 12.5px; line-height: 1.5;  font-weight: 400; }

      .t-metaLG { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 14.5px; line-height: 1.7; font-weight: 400; }
      .t-metaMD { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 13px;   line-height: 1.5; font-weight: 500; }
      .t-metaSM { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 11.5px; line-height: 1.4; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; }
      .t-metaXS { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 10px;   line-height: 1.3; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; }

      .t-noteLG { font-family: "Caveat", "Segoe Print", cursive; font-size: 21px; line-height: 1.3; font-weight: 600; }
      .t-noteMD { font-family: "Caveat", "Segoe Print", cursive; font-size: 17px; line-height: 1.3; font-weight: 600; }

      /* Faint fading graph-paper texture behind a centered hero/auth band
         (design_system_v6/_shared.css's .t6-sheet-fade) — pure CSS, only
         var(--t-grid), so unlike the decorative drafting-sheet grain/hatch/
         joints this is a plain generic token effect every unbranded project
         can use too. Absolutely positioned within its own band; the band
         needs position:relative. */
      .t6-sheet-fade {
        position: absolute; inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(var(--t-grid) 1px, transparent 1px),
          linear-gradient(90deg, var(--t-grid) 1px, transparent 1px);
        background-size: 24px 24px;
        -webkit-mask-image: linear-gradient(to bottom, black 0%, black 45%, transparent 95%);
        mask-image: linear-gradient(to bottom, black 0%, black 45%, transparent 95%);
      }

      @media (max-width: 768px) {
        .t-displayHero { font-size: 42px; letter-spacing: -0.025em; }
        .t-displayXL   { font-size: 34px; }
      }
    `,
  },
]

// =====================================================================================================
// ======================================== todo: move these to UI
// =====================================================================================================
import {
    attributionTheme
} from "../patterns/page/components/sections/components/dataWrapper/components/Attribution.theme";
import {
    filterTheme
} from "../patterns/page/components/sections/components/dataWrapper/components/filters/RenderFilters.theme";
// ======================================================================================================


const components = {
    pages: pagesTheme,
    datasets: datasetsTheme,
    auth: authTheme,
    "compatibility": "border-[#191919] pt-[41px]",

    "heading": {
        "1": "text-blue-500 font-bold text-xl tracking-wider py-1 pl-1",
        "2": "text-lg tracking-wider",
        "3": "text-md tracking-wide",
        "base": "p-2 w-full font-sans font-medium text-md bg-transparent",
        "default": ""
    },
    layout: layoutTheme,
    layoutGroup: layoutGroupTheme,
    nestable: nestableTheme,
    sidenav: sideNavTheme,
    topnav: topNavTheme,
    logo: logoTheme,
    themeToggle: themeToggleTheme,
    tabs: tabsTheme,
    button: buttonTheme,
    input: inputTheme,
    icon: iconTheme,
    field: fieldTheme,
    dialog: dialogTheme,
    dialogActions: dialogActionsTheme,
    modal: modalTheme,
    label: labelTheme,
    pill: pillTheme,
    permissions: permissionsTheme,
    multiselect: multiselectTheme,
    table: tableTheme,
    lexical:lexicalTheme,
    textSettings: textSettingsTheme,
    dataCard: dataCardTheme,
    attribution: attributionTheme,
    filters: filterTheme,
    avlGraph: avlGraphTheme,
    navigableMenu: navigableMenuTheme,
    map: mapTheme,
    nestableInHouse: nestableInHouseTheme
}
const theme = {

    admin: {
        navOptions: {
            "logo": "",
            "sideNav": {
                "size": "compact",
                "logo": "top",
                "dropdown": "none",
                "position": "fixed",
                "nav": "main"
            },
            "topNav": {
                "size": "none",
                "dropdown": "right",
                "logo": "left",
                "position": "sticky",
                "nav": "none"
            }
        },
        page: {
            pageWrapper: 'w-full h-full flex-1 flex flex-row p-2',
            pageWrapper2: 'grow p-6 lg:rounded-lg lg:bg-white lg:p-10 lg:shadow-xs lg:ring-1 lg:ring-zinc-950/5 dark:lg:bg-zinc-900 dark:lg:ring-white/10'
        },
        ...adminPatternTheme
    },
    //navOptions,
    ...components,

    "Icons":icons,
    settings,
    widgets: defaultWidgets,
    page_templates: defaultPageTemplates,
    site_templates: defaultSiteTemplates,
    fonts,
}

export default theme
