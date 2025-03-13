import {Link} from "react-router-dom";
import React, {useContext} from "react";
import {ComponentContext} from "../../dataWrapper";
import {CMSContext} from "../../../../../siteConfig";

export const attributionTheme = {
    wrapper: 'w-full p-1 flex gap-1 text-xs text-gray-900',
    label: '',
    link: ''
}

export const Attribution = () => {
    const { theme = { attribution: attributionTheme } } = React.useContext(CMSContext) || {}
    const {state:{sourceInfo: {isDms, source_id, name, view_id, view_name, updated_at}}, compType} = useContext(ComponentContext);
    const dateOptions = {year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"};
    const updatedTimeString = updated_at ? new Date(updated_at).toLocaleString(undefined, dateOptions) : null;

    return (
        <div className={`${theme.attribution.wrapper} ${compType === 'graph' ? `pt-[0px]` : `pt-[16px]`}`}>
            <span className={theme.attribution.label}>Attribution:</span>
            <Link
                className={theme.attribution.link}
                to={`/${isDms ? `forms` : `cenrep`}/source/${source_id}/${isDms ? `view` : `versions`}/${view_id}`}>
                {name} ({view_name}) {updatedTimeString ? `(${updatedTimeString})` : null}
            </Link>
        </div>
    )
}