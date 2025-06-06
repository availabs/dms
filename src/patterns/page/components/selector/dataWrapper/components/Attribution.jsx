
import React, {useContext} from "react";
import {CMSContext, ComponentContext} from "../../../../context";
import {ThemeContext} from "../../../../../../ui/useTheme";

export const attributionTheme = {
    wrapper: 'w-full p-1 flex gap-1 text-xs text-gray-900',
    label: '',
    link: ''
}

export const Attribution = () => {
    const { damaBaseUrl } = React.useContext(CMSContext) || {}
    const { theme = { attribution: attributionTheme } } = React.useContext(ThemeContext) || {}
    const {state:{sourceInfo: {isDms, source_id, name, view_id, view_name, updated_at}}, compType} = useContext(ComponentContext);
    const dateOptions = {year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"};
    const updatedTimeString = updated_at ? new Date(updated_at).toLocaleString(undefined, dateOptions) : null;

    return (
        <div className={`${theme.attribution.wrapper} ${compType === 'graph' ? `pt-[0px]` : `pt-[16px]`}`}>
            <span className={theme.attribution.label}>Attribution:</span>
            <Link
                className={theme.attribution.link}
                to={`${isDms ? `/forms` : damaBaseUrl}/source/${source_id}`}>
                {/*to={`/${isDms ? `forms` : damaBaseUrl}/source/${source_id}/${isDms ? `view` : `versions`}/${view_id}`}>*/}
                {name} ({view_name}) {updatedTimeString ? `(${updatedTimeString})` : null}
            </Link>
        </div>
    )
}