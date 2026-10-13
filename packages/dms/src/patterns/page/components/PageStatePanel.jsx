import React from "react";
import { ThemeContext, getComponentTheme } from "../../../ui/useTheme";
import { errorPageTheme } from "../pages/errorPage.theme";

// A centred "what happened + where to go" block: tinted icon, title, one sentence, actions
// (children). The page pattern's error page, no-access and page-does-not-exist states.
// Styled by `pages.errorPage`; tone = 'brick' | 'amber' | 'neutral'. (The datasets pattern has its
// own StatePanel — patterns don't import from each other.)
export default function PageStatePanel({ icon, tone = 'brick', title, text, children }) {
  const { theme: themeFromContext = {}, UI } = React.useContext(ThemeContext) || {};
  const t = { ...errorPageTheme, ...getComponentTheme(themeFromContext, 'pages.errorPage') };
  const Icon = UI?.Icon;
  const toneCls = tone === 'amber' ? t.panelIconAmber : tone === 'neutral' ? t.panelIconNeutral : t.panelIconBrick;
  return (
    <div className={t.panel}>
      {Icon && icon ? <span className={`${t.panelIcon} ${toneCls}`}><Icon icon={icon} className={t.panelIconSvg}/></span> : null}
      <h2 className={t.panelTitle}>{title}</h2>
      {text ? <p className={t.panelText}>{text}</p> : null}
      {children ? <div className={t.panelActions}>{children}</div> : null}
    </div>
  );
}

// The same panel as a whole screen: the page's Layout (site nav kept) → page column → card → panel.
// Used by view.jsx / edit/index.jsx for no-access and page-does-not-exist.
export function PageStateScreen({ navItems = [], resolveNav, secondNav, ...panel }) {
  const { theme: themeFromContext = {}, UI } = React.useContext(ThemeContext) || {};
  const t = { ...errorPageTheme, ...getComponentTheme(themeFromContext, 'pages.errorPage') };
  const { Layout } = UI || {};
  return (
    <Layout navItems={navItems} resolveNav={resolveNav} secondNav={secondNav}>
      <div className={t.page}>
        <section className={t.card}>
          <PageStatePanel {...panel} />
        </section>
      </div>
    </Layout>
  );
}
