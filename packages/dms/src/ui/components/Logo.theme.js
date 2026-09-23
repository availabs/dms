export const logoTheme = {
  // This IS the actual rendered row (Logo.jsx wraps the icon+title in a
  // single <Link className={logoWrapper}> with nothing else around it — the
  // matching key on SideNav.theme.jsx is never read by SideNav.jsx, so
  // putting the row's real height/padding/border there did nothing visually;
  // it has to live here). Matches the mockups' sidenav header band exactly.
  logoWrapper: 'flex w-full items-center gap-2.5 h-14 px-4 border-b border-[var(--t-rule)] bg-[var(--t-paper)]',
  // tessera_v6 is this library's own default look now (not a placeholder for
  // some other project's brand), so its real mark is the default here too —
  // drawn as a CSS mask over a cobalt background (same technique as
  // tessera_v6's own `.t6-logo-mark`, inlined as an arbitrary value instead
  // of relying on that class, which only tessera_v6's own theme-extras CSS
  // defines) so it recolors correctly in dark mode instead of freezing a
  // baked light-mode color like a plain <img> would. The SVG is a static
  // asset under the outer repo's public/ (served at this literal path
  // regardless of which theme a given deployment actually uses), not a JS
  // import, so referencing it here doesn't create a real package-boundary
  // dependency.
  // h-6/w-6 matches the mockups' sidenav-header mark size specifically (the
  // login page's larger h-10 mark is a different context this base library
  // doesn't render into — every place SideNav mounts this widget is the same
  // compact row).
  logoAltImg: "inline-flex h-6 w-6 bg-[var(--t-cobalt)] [mask:url('/themes/tessera/tessera-mark-v6.svg')_center/contain_no-repeat] [-webkit-mask:url('/themes/tessera/tessera-mark-v6.svg')_center/contain_no-repeat]",
  imgWrapper: '',
  img: '',
  imgClass: 'h-6 w-auto',
  titleWrapper: 't-displaySM text-[var(--t-ink)]',
  // The library's own fallback brand name — shown wherever no site theme
  // provides its own `logo.title` (e.g. a pattern with no `selectedTheme`,
  // or the manage pages under that fallback). Every real project theme sets
  // its own value here already (mny/avail/transportny set a brand name or
  // an empty string; the real `tessera_v6` theme sets its own 'Tessera'), so
  // this only affects the unbranded/default path — "Admin" reads better
  // there than a specific product name.
  title: 'Admin',
  linkPath: '/'
}

export const logoSettings =  [{
  label: "Logo",
  type: 'inline',
  controls: Object.keys(logoTheme)
      .map(k => {
        return {
          label: k,
          type: 'Textarea',
          path: `logo.${k}`
        }
      })
}]
