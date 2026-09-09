import React from 'react';
import { ThemeContext, getComponentTheme } from '../../../ui/useTheme';
import { linkPageNoticeTheme } from './LinkPageNotice.theme';

// What the section canvas is replaced with, in EDIT mode, for a link page — a page
// carrying `nav_link` (page.format.js). Such a page has no sections by design, so an
// empty canvas would read as "something failed to load". View mode never renders this:
// pages/view.jsx redirects to the destination instead.
export default function LinkPageNotice({ navLink }) {
  const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
  const t = { ...linkPageNoticeTheme, ...getComponentTheme(themeFromContext, 'linkPageNotice') };

  return (
    <div className={t.wrapper}>
      <div className={t.panel}>
        <div className={t.title}>This page is a link</div>
        <div className={t.body}>
          It has no content of its own. Visitors who click it in the nav go to:
        </div>
        <div className={t.destination}>{navLink}</div>
        <div className={t.hint}>
          Change the destination under <b>Nav Link</b> in page settings — clearing that
          field turns this back into an ordinary content page.
        </div>
      </div>
    </div>
  );
}
