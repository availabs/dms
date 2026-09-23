import { viewAsBarTheme } from './components/ViewAsBar.theme';

const theme = {
    viewAsBar: viewAsBarTheme,
    emailTheme: {
        primaryColor:    '#1e3a8a',  // blue-900 — titles, button text
        accentColor:     '#dbeafe',  // blue-100 — header bg, button bg, card border
        textColor:       '#374151',  // gray-700 — body copy
        backgroundColor: '#f4f4f5', // page background
    },
    authPages: {
        container: `bg-[linear-gradient(0deg,rgba(244,244,244,0.96),rgba(244,244,244,0.96))]  bg-[size:500px] pb-[4px]`,//`bg-gradient-to-b from-[#F4F4F4] to-[#F4F4F4] bg-[url('/themes/mny/topolines.png')] `,
        wrapper1: 'w-full h-full flex-1 flex flex-col ', // first div inside Layout
        wrapper2: 'w-full h-full flex-1 flex flex-row p-4 min-h-screen', // inside page header, wraps sidebar
        wrapper3: 'flex flex-1 w-full border-2 flex-col border shadow-md rounded-lg relative text-md font-light leading-7 p-4 justify-content-center',
        iconWrapper: 'z-5 absolute right-[10px] top-[5px]',
        icon: 'text-slate-400 hover:text-blue-500',
        // The mockups' "bare" layout (design_system_v6/pages/login.html) —
        // no SideNav/TopNav, one centered card. AuthLayout (siteConfig.jsx)
        // renders through this instead of the shared Layout/LayoutGroup
        // whenever the pattern's own theme doesn't set a real
        // `sectionGroup.default.wrapper4ImgList` (mny's own theme does, to
        // keep its existing two-column split unchanged).
        bareWrapper: 'min-h-screen flex flex-col bg-[var(--t-paper)]',
        // Its own background (not just relying on bareWrapper's, the ancestor
        // painting behind it) — this is the div that actually wraps the page
        // content (`{children}`), so it shouldn't depend on inheritance to
        // not render transparent.
        bareBand: 'w-full flex-1 relative flex items-center justify-center px-6 py-16 bg-[var(--t-paper)]',
        // Wraps the page (`{children}`) inside bareBand, above the
        // t6-sheet-fade overlay — must stay positioned (`relative`) or the
        // grid paints over the card on every auth page.
        bareContent: 'relative w-full',
        sectionGroup: {
            default: {
                // wrapper1/wrapper2/wrapper3/sideNavContainer* are dead weight
                // from the pre-"bare" split layout — AuthLayout no longer
                // renders through them when there's no wrapper4ImgList (see
                // siteConfig.jsx) — kept only because a theme could
                // conceivably still reference them directly.
                wrapper1: "w-screen h-screen flex flex-row", // inside page header, wraps sidebar
                wrapper2: "flex w-screen h-screen justify-center",
                wrapper3: "w-full place-content-start md:place-content-center",
                iconWrapper: "z-5 absolute right-[10px] top-[5px] print:hidden",
                icon: "text-[var(--t-pencil)] hover:text-[var(--t-cobalt)]",
                sideNavContainer1: "hidden xl:block",
                sideNavContainer2:
                    "min-w-[302px] max-w-[302px] sticky top-20 hidden xl:block h-[100vh_-_102px] pr-2",
                // The mockups' card (login.html's `.bg-panel.border.border-rule
                // .rounded-lg.p-8`, max-w-sm) — ported 2026-09-18. `mergeTheme`
                // deep-merges a site theme's `sectionGroup.default` onto this
                // object key-by-key — it does NOT replace it — so any key a
                // theme doesn't set of its own still leaks in from here. mny's
                // own theme (mny/auth.js) blanks out the keys it doesn't want
                // inherited (iconMarkWrapper/iconMark, headingText/subtitleText)
                // rather than actually replacing this whole object.
                //
                // `formWrapper` is load-bearing, not decorative: the pages'
                // <form> tag had no className at all, so `pageWrapper`'s own
                // `max-w-sm w-full` had nothing to size itself against — a
                // block element sizes to its shrink-to-fit parent, not the
                // viewport, so the card rendered narrower than max-w-sm
                // actually allows. `w-full` on the form (inside `bareContent`, within
                // `bareBand`) is what lets it expand up to that cap.
                formWrapper: "w-full",
                iconMarkWrapper: "w-10 h-10 rounded-md border border-[var(--t-rule)] bg-[var(--t-panel)] flex items-center justify-center text-[var(--t-cobalt)] mx-auto",
                iconMark: "w-6 h-6",
                pageWrapper: "max-w-sm w-full mx-auto flex flex-col gap-[2vh] p-8 bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg shadow-[var(--t-shadow-drag)]",
                pageTitle: "t-displayMD text-[var(--t-ink)] text-center",
                // Richer heading (authLogin.jsx only — the other 3 pages always
                // use the plain `pageTitle` div above). Kept generic (no brand
                // name), matching `logo.title: 'Admin'`'s own reasoning.
                headingBlock: "text-center",
                heading: "t-displayMD text-[var(--t-ink)]",
                headingAccent: "text-[var(--t-cobalt)]",
                subtitle: "t-proseSM text-[var(--t-graphite)] mt-1.5",
                headingText: "Sign in",
                subtitleText: "Your sites and datasets are where you left them.",
                forgotPasswordText: "t-proseSM text-[var(--t-cobalt)] hover:text-[var(--t-cobalt-deep)]",
                actionButton: "w-full flex items-center justify-center text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-2.5 cursor-pointer",
                actionText: "t-proseSM font-medium text-center",
                prompt: "t-proseSM text-[var(--t-graphite)] flex gap-1 justify-center mt-2",
                // Notices. Defaults are the literals the pages carried before these
                // keys existed (2026-09-12), so a theme that sets nothing is unchanged.
                error: "text-sm text-[var(--t-brick)] bg-[var(--t-brick-soft)] rounded-md px-2 py-1", // authLogin
                disabledNotice: "text-sm text-[var(--t-pencil)]",                // authSignup, disabled
                status: "text-sm text-[var(--t-brick)] mt-2",                    // authSignup status line
            },
        },
        // The `/auth/*` placeholder (siteConfig.jsx).
        landing: "flex flex-col gap-3",
        // Manage pages: which named `layout` / `layoutGroup` style AdminLayout
        // asks for. `manageLayoutStyle` unset = the pattern's default Layout options
        // (BC) — a theme sets e.g. `manageLayoutStyle: "app"` to put them on its
        // admin layout. `manageLayoutGroupStyle` defaults to `"adminContent"` — the
        // LayoutGroup style matching patternEditor.theme.js's own content padding
        // (p-5 lg:p-8); LayoutGroup's OWN default ("content") has much bigger
        // py-8/pl-12 band padding, giving Profile/Users/Groups' titles noticeably
        // more inset than Overview's title (flagged live, 2026-09-21).
        manageLayoutStyle: undefined,
        manageLayoutGroupStyle: 'adminContent',
        // The MANAGE pages — users / groups / profile, rendered through AdminLayout.
        // One key per literal the pages used to hardcode; where two pages differed
        // they keep separate keys (unifying them would be a visual change).
        //
        // Ported to tessera's var(--t-*) tokens (2026-09-16) from the design-system
        // mockups (src/themes/tessera/design_system_v6/pages/admin-users.html,
        // admin-groups.html, admin-profile.html) — the first v6 design these pages
        // ever had. This is the base fallback merged in for every project's
        // Users/Groups/Profile pages; a site overrides it via `getPatternTheme` in
        // `manageAuthConfig` (siteConfig.jsx) — MNY resolves to the dedicated
        // `mny_admin` theme rather than overriding these keys directly.
        // `headerStats`/`headerStatsItem`/`headerStatsValue`/`headerStatsLabel`
        // (Users' user/group counts), `modalHeader`/`modalTitle`/`modalCloseBtn`
        // (a title + working close button on every modal), and `avatar` (Profile's
        // initial-letter badge) are new elements added to the live components
        // alongside this theme pass — the mockups called for them, but they didn't
        // exist in the DOM before.
        manage: {
            // The page-level background behind pageWrapper/profileWrapper —
            // AdminLayout (siteConfig.jsx) uses this instead of the auth
            // login/signup pages' hardcoded `container` gradient, which isn't
            // dark-mode aware.
            container: "bg-[var(--t-paper)] min-h-screen",
            // "admin / <page>" breadcrumb — AdminLayout (siteConfig.jsx) renders
            // this itself (not the shared Layout's own TopNav, which is gated by
            // a single global on/off switch app-wide). Matches the mockups'
            // header band; unset (no `breadcrumbBar`) renders nothing, so a
            // theme that hasn't set this yet is unchanged.
            breadcrumbBar: "h-14 flex-none border-b border-[var(--t-rule)] flex items-center gap-3 px-5 lg:px-8",
            breadcrumbHome: "t-metaMD text-[var(--t-graphite)] hover:text-[var(--t-ink)]",
            breadcrumbSep: "t-metaMD text-[var(--t-pencil)]",
            breadcrumbCurrent: "t-metaMD text-[var(--t-cobalt)]",
            // holds the ThemeToggle on the trailing end of the breadcrumb bar
            // (moved here from the sidenav's bottomMenu, which now only
            // carries UserMenu — 2026-09-22), matching
            // patterns/admin/siteConfig.theme.js's own `breadcrumbActions`.
            breadcrumbActions: "flex items-center gap-2",
            // Users/Groups/Profile content width — the Pattern Editor's own
            // `max-w-5xl` cap (Overview), shared by Sites/Themes (2026-09-22).
            contentWrapper: "w-full min-w-0 max-w-5xl",
            // `pageWrapper`/`profileWrapper` now wrap ONLY the content below the title
            // (the table for users/groups, the Reset-Password action for profile) — NOT
            // the title itself. Previously both lived inside the same card, so the whole
            // page (title + content) read as one continuous white box; the mockups
            // (admin-{users,groups,profile}.html) always render the title flush on the
            // page background as its own section, with the card starting below it
            // (flagged live, 2026-09-21 — "they don't do title well... merged with the
            // main container"). `profileWrapper` is now just a flex layout (no card of
            // its own) since ITS card moved to `profileActions` below.
            pageWrapper: "bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg overflow-hidden",  // users, groups — wraps the table only
            profileWrapper: "flex flex-col gap-4", // profile — layout only, not a card
            headerOuter: "w-full flex flex-wrap items-center justify-between gap-3 pb-3 mb-3 border-b border-[var(--t-rule)]", // groups only — flush, sits above pageWrapper
            headerRow: "w-full flex flex-wrap items-center gap-3 pb-3 mb-3 border-b border-[var(--t-rule)]", // users + profile — flush
            headerTitle: "t-displayMD text-[var(--t-ink)]",
            avatar: "w-9 h-9 rounded-md bg-[var(--t-cobalt)] text-[var(--t-accent-ink)] flex items-center justify-center text-sm font-medium flex-none", // profile
            // Profile's second band — the Reset Password action's own card (the mockup's
            // separate "account" card, `admin-profile.html`'s "profile-actions" section) —
            // now carries the bg-panel treatment itself since `profileWrapper` no longer does.
            profileActions: "bg-[var(--t-panel)] border border-[var(--t-rule)] rounded-lg p-4",
            profileActionsLabel: "t-metaXS text-[var(--t-pencil)] uppercase tracking-[0.06em] mb-3",
            // NB `UI.Button` treats `className` as a REPLACEMENT for its style, so
            // this is the whole look of the "Add new" button — cobalt primary,
            // matching Button.theme.jsx's own default so it stays consistent with
            // every other primary action in the app.
            headerAction: "inline-flex items-center gap-1.5 text-sm font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-3.5 py-1.5",
            // Users' user/group counts (authUsers.jsx headerRow) — Groups doesn't
            // render these, so `headerStats*` only matters there. Boxed stat pair
            // (bg-panel/border/rounded-lg), matching Sites' own `statsStrip` look
            // (`editSite.theme.js`) so every page's stats read the same — kept
            // boxed per explicit request rather than flattening to inline text.
            headerStats: "flex items-stretch divide-x divide-[var(--t-rule)] border border-[var(--t-rule)] rounded-lg bg-[var(--t-panel)] overflow-hidden",
            headerStatsItem: "px-4 py-2",
            headerStatsValue: "text-xl font-semibold tracking-[-0.015em] tabular-nums leading-none text-[var(--t-ink)]",
            headerStatsLabel: "t-metaXS text-[var(--t-pencil)] mt-1",
            // This boxed stats pair is TALLER than a bare one-line title, so Users'
            // title sat visibly lower than every other page's (its row's own height,
            // and the title's vertical centering within it, grows to fit the box).
            // Sites doesn't have this problem because its title always has a real
            // second line (`identitySubtitle` — the site's domain) giving its own
            // title block roughly the same height as its stats box. `headerSubtitleSpacer`
            // mimics that second line — same size/spacing as Sites' `identitySubtitle`,
            // just empty (`aria-hidden`, non-breaking space to hold its own line-height)
            // — for any header that needs to match a boxed stats pair's height without
            // a real subtitle to show (flagged live, 2026-09-21).
            headerSubtitleSpacer: "t-metaSM mt-1",
            tableHeaderCell: "flex items-center gap-2 py-1",
            // Secondary/metadata text (Users' Created/Last Login columns) — muted,
            // distinct from the primary graphite body text `cellInner` already uses.
            metaText: "t-metaSM text-[var(--t-pencil)]",
            // Modal.jsx itself renders no title or close affordance — these three
            // keys are new, added to the Add User / Add Group / Reset Password
            // modals alongside this theme pass so every modal has one.
            modalHeader: "flex items-center justify-between mb-4",
            modalTitle: "t-displaySM text-[var(--t-ink)]",
            modalCloseBtn: "text-[var(--t-pencil)] hover:text-[var(--t-ink)]",
            modalBody: "flex flex-row gap-3",
            notice: "p-4 text-sm text-[var(--t-graphite)]",
            profileLink: "inline-flex items-center gap-1.5 text-sm font-medium text-[var(--t-ink)] border border-[var(--t-rule-strong)] hover:border-[var(--t-ink)] rounded-md px-3.5 py-1.5 w-fit",
            // A row's View As / reset password buttons — a quiet outline style,
            // distinct from the solid-cobalt primary actions (headerAction/modalAction).
            rowAction: "t-metaXS text-[var(--t-graphite)] border border-[var(--t-rule)] rounded-md px-2 py-1 hover:border-[var(--t-rule-strong)] hover:text-[var(--t-ink)]",
            // The Add User / Add Group modal's submit button — matches headerAction's
            // cobalt primary look (this happens to be UI.Button's own default too,
            // but set explicitly so it stays correct if that default ever changes).
            modalAction: "inline-flex items-center gap-1.5 text-sm font-medium text-[var(--t-accent-ink)] bg-[var(--t-cobalt)] hover:bg-[var(--t-cobalt-deep)] rounded-md px-4 py-2",
            // The table-header search inputs (Input's className is also a full
            // replacement, same as Button) — compact, since they sit inside a
            // table header cell rather than a form.
            headerInput: "bg-[var(--t-panel)] border border-[var(--t-rule)] rounded px-2 py-1 text-xs text-[var(--t-ink)] placeholder:text-[var(--t-pencil)] outline-none focus:border-[var(--t-rule-strong)] w-32",
            // Unset = the manager's Sites / Themes / Auth menu. A client site
            // sets `[{name, path}]` — typically just Profile / Users / Groups.
            menuItems: undefined,
        },
    },
    // The account menu (components/menu.jsx).
    userMenu: {
        avatar: "h-[47px] w-[47px] border border-[#E0EBF0] rounded-full flex items-center justify-center",
        avatarIcon: "size-6 fill-[#37576b]",
        loginLink: "flex items-center px-8 text-lg font-bold h-12 text-slate-500",
        header: "py-2",
        headerEmail: "text-md font-thin tracking-tighter text-left",
        headerGroup: "text-xs font-medium -mt-1 tracking-widest text-left",
        trigger: "px-1",
    },
    field: {
        fieldWrapper: "flex flex-col gap-[2vh]",
        field: "flex flex-col gap-[1vh]",
        label: "font-semibold text-[var(--t-ink)] text-sm leading-none tracking-normal"
    },
}

export default theme