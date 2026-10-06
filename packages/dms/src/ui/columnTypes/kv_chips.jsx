import React from "react";
import { ThemeContext, getComponentTheme } from "../useTheme";
import { kvChipsTheme } from "./kv_chips.theme";
import { parseKvChips } from "./structuredText.utils";

// kv_chips column type — a record (an environment captured with a ticket: url, browser, window)
// as a row of label / value chips. The value is a JSON object, a JSON array of {label, value} or
// strings, or plain text with entries joined by " · " (unlabeled chips). Read-only: edit mode
// shows the same chips. `emptyText`: optional text when there are no entries.
export const KvChipsView = ({ value, activeStyle, emptyText }) => {
    const { theme: themeFromContext = {} } = React.useContext(ThemeContext) || {};
    const t = { ...kvChipsTheme.styles[0], ...getComponentTheme(themeFromContext, "kvChips", activeStyle) };
    const chips = parseKvChips(value);
    if (!chips.length) return emptyText ? <span className={t.empty}>{emptyText}</span> : null;
    return (
        <span className={t.wrapper}>
            {chips.map((c, i) => (
                <span key={i} className={t.chip}>
                    {c.label ? <span className={t.key}>{c.label}</span> : null}
                    <span className={t.value}>{c.value}</span>
                </span>
            ))}
        </span>
    );
};

export const KvChipsEdit = (props) => <KvChipsView {...props} />;
