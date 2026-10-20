// The edit canvas of a link page (components/LinkPageNotice.jsx). tessera v6, 2026-10-13, from
// design_system_v6/pages/page-new.html: a card like the page-state panels (neutral link icon, no
// accent). Pre-v6 values frozen in src/themes/_legacy/pages.js `linkPageNotice` (`icon` '' → no
// icon; `settingName` / `settingOff` name the old "Nav Link" field).
export const linkPageNoticeTheme = {
  wrapper: 'flex justify-center py-16 px-6',
  panel: 'w-full max-w-lg rounded-lg border border-[var(--t-rule)] bg-[var(--t-panel)] p-6 text-center',
  icon: 'Link',                   // '' → no icon (pre-v6)
  iconWrap: 'size-11 mx-auto mb-3 rounded-full flex items-center justify-center bg-[var(--t-well)] text-[var(--t-graphite)]',
  iconSvg: 'size-5',
  title: 't-displaySM text-[var(--t-ink)]',
  body: 'mt-1 t-proseSM text-[var(--t-graphite)]',
  destination: 'mt-3 rounded-md bg-[var(--t-well)] px-3 py-2 t-metaMD text-[var(--t-ink)] break-all',
  hint: 'mt-3 t-proseXS text-[var(--t-pencil)]',
  hintEm: 'font-semibold text-[var(--t-ink)]',
  // the settings-pane control the hint points at (settingsPane.jsx: v6 "Link page" switch)
  settingName: 'Link page',
  settingOff: 'switching it off',
};
