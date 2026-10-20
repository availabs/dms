import React, {useContext} from "react";
import {ThemeContext} from "../../../../../../ui/useTheme";
import { internalPagesTheme } from "./internalPages.theme";

export default function Debug({ source }) {
    const {theme} = useContext(ThemeContext) || {};
    const t = { ...internalPagesTheme, ...(theme?.datasets?.internalPages || {}) };
    const json = <pre className={t.debugPre || undefined}>{JSON.stringify(source, null, 3)}</pre>;
    // '' debugCard → just the <pre> (pre-v6)
    if (!t.debugCard) return json;
    return (
        <div className={t.debugPage}>
            <section className={t.debugCard}>
                {t.debugLabel ? <p className={t.debugLabel}>raw source json</p> : null}
                {json}
            </section>
        </div>
    );
}
