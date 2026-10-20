import React from 'react';
import { ThemeContext, getComponentTheme } from '../../../ui/useTheme';
import { linkPageNoticeTheme } from './LinkPageNotice.theme';

// What the section canvas is replaced with, in EDIT mode, for a link page — a page
// carrying `nav_link` (page.format.js). Such a page has no sections by design, so an
// empty canvas would read as "something failed to load". View mode never renders this:
// pages/view.jsx redirects to the destination instead.
// It sits in the same LayoutGroup band style the page's content would use (`groupTheme`, the
// first content band's `theme`), so it gets the page's own spacing — e.g. MNY's offset below its
// floating header — instead of touching the top bar.
export default function LinkPageNotice({ navLink, groupTheme }) {
  const { theme: themeFromContext = {}, UI } = React.useContext(ThemeContext) || {};
  const LayoutGroup = UI?.LayoutGroup;
  const styleIndex = (themeFromContext?.layoutGroup?.styles || []).map(d => d?.name).indexOf(groupTheme || 'default');
  // registered as pages.linkPageNotice (page defaultTheme.js); read from there, not the theme root
  const t = { ...linkPageNoticeTheme, ...getComponentTheme(themeFromContext, 'pages.linkPageNotice') };
  const Icon = UI?.Icon;

  const notice = (
    <div className={t.wrapper}>
      <div className={t.panel}>
        {Icon && t.icon ? <span className={t.iconWrap}><Icon icon={t.icon} className={t.iconSvg} /></span> : null}
        <div className={t.title}>This page is a link</div>
        <div className={t.body}>
          It has no content of its own. Visitors who click it in the nav go to:
        </div>
        <div className={t.destination}>{navLink}</div>
        <div className={t.hint}>
          Change the destination under <b className={t.hintEm}>{t.settingName}</b> in page settings — {t.settingOff} turns
          this back into an ordinary content page.
        </div>
      </div>
    </div>
  );
  return LayoutGroup ? <LayoutGroup activeStyle={styleIndex === -1 ? 0 : styleIndex}>{notice}</LayoutGroup> : notice;
}
