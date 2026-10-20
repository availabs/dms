import React from "react";
import { ThemeContext } from "../../../ui/useTheme";
import { errorPageTheme } from "../pages/dataTypes/default/errorPage.theme";

// A centred "what happened + where to go" block: tinted icon, title, one sentence, actions
// (children). Used by the datasets error page and the source page's not-found state.
// Styled by `datasets.errorPage`; tone = 'brick' | 'amber'.
export default function StatePanel({ icon, tone = 'brick', title, text, children }) {
  const { theme, UI } = React.useContext(ThemeContext) || {};
  const t = { ...errorPageTheme, ...(theme?.datasets?.errorPage || {}) };
  const Icon = UI?.Icon;
  const toneCls = tone === 'amber' ? t.panelIconAmber : t.panelIconBrick;
  return (
    <div className={t.panel}>
      {Icon && icon ? <span className={`${t.panelIcon} ${toneCls}`}><Icon icon={icon} className={t.panelIconSvg}/></span> : null}
      <h2 className={t.panelTitle}>{title}</h2>
      {text ? <p className={t.panelText}>{text}</p> : null}
      {children ? <div className={t.panelActions}>{children}</div> : null}
    </div>
  );
}
