import React, {useContext} from "react";
import {Link} from "react-router";
import {ComponentContext} from "../../../../../context";
import {ThemeContext} from "../../../../../../../ui/useTheme";

export const attributionTheme = {
    wrapper: 'w-full p-1 pt-[16px] flex gap-1 text-xs text-gray-900',
    label: '',
    link: ''
}

export const Attribution = () => {
    const { theme = { attribution: attributionTheme } } = React.useContext(ThemeContext) || {}
    // baseUrl is now included in sourceInfo by useDataSource.js
    const {state:{sourceInfo: {source_id, name, view_name, updated_at, baseUrl}}} = useContext(ComponentContext);
    const dateOptions = {year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"};
    const updatedTimeString = updated_at ? new Date(updated_at).toLocaleString(undefined, dateOptions) : null;

    return (
        <div className={`${theme.attribution.wrapper}`}>
            <span className={theme.attribution.label}>Attribution:</span>
            <Link
                className={theme.attribution.link}
                to={`${baseUrl || ''}/source/${source_id}`}>
                {/*to={`/${isDms ? `forms` : damaBaseUrl}/source/${source_id}/${isDms ? `view` : `versions`}/${view_id}`}>*/}
                {name} ({view_name}) {updatedTimeString ? `(${updatedTimeString})` : null}
            </Link>
        </div>
    )
}