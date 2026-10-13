import React, {useContext} from "react";
import {DatasetsContext} from "../context";
import {ThemeContext} from "../../../ui/useTheme";
import {createPageTheme} from "../pages/createPage.theme";

// One numbered step of a create flow (gis / csv upload, internal table, file upload) — the v6
// "each flow reads as numbered steps" layout (datasets-create.html). Themed through
// `datasets.createPage` step* keys; with `step` '' (pre-v6 themes) it renders only its children,
// so the flow's markup is exactly what it was.
//   state: 'active' | 'done' | 'todo'
//   collapsed: keep the children MOUNTED but hide them (flow parts that run their own polling /
//   fetches — e.g. the GIS select-layer step — must stay mounted before they're shown)
export default function CreateStep({n, title, note, state = 'active', collapsed = false, children}) {
    const {UI} = useContext(DatasetsContext) || {};
    const {theme} = useContext(ThemeContext) || {};
    const t = {...createPageTheme, ...(theme?.datasets?.createPage || {})};
    if (!t.step) return <>{children}</>;
    const {Icon} = UI;
    const hasBody = children !== undefined && children !== null && children !== false && children !== '';
    return (
        <section className={state === 'todo' ? t.stepTodo : t.step}>
            <div className={hasBody && !collapsed ? t.stepHeadBordered : t.stepHead}>
                {state === 'done'
                    ? <span className={t.stepDotDone}><Icon icon={t.stepDoneIcon} className={t.stepDoneIconClass}/></span>
                    : <span className={state === 'todo' ? t.stepDotTodo : t.stepDot}>{n}</span>}
                <span className={t.stepTitle}>{title}</span>
                {note ? <span className={t.stepNote}>{note}</span> : null}
            </div>
            {hasBody ? <div className={collapsed ? t.stepBodyCollapsed : t.stepBody}>{children}</div> : null}
        </section>
    );
}
