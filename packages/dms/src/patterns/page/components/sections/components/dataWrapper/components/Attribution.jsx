import React, {useContext} from "react";
import {Link} from "react-router";
import {ComponentContext} from "../../../../../context";
import {ThemeContext} from "../../../../../../../ui/useTheme";
import {legacyStateToBuildInput} from "../buildUdaConfig";
import {attributionTheme} from "./Attribution.theme";

export const Attribution = () => {
    const { theme = { attribution: attributionTheme } } = React.useContext(ThemeContext) || {}
    // baseUrl is now included in externalSource by useDataSource.js
    const {state:{ externalSource, join}} = useContext(ComponentContext);
    const isJoinPresent = !!join && join?.sources?.table2?.view;
    if (isJoinPresent) {
        //need a row for each source in join
        const attribRows = Object.keys(join.sources).map((sourceAlias) => {
            const curJoinSource = join.sources[sourceAlias];

            const attribSource = curJoinSource?.sourceInfo ? curJoinSource?.sourceInfo : externalSource;
            const { source_id, name, view_name, updated_at, baseUrl } = attribSource;

            const dateOptions = { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric" };
            const updatedTimeString = updated_at ? new Date(updated_at).toLocaleString(undefined, dateOptions) : null;
            return (
                <Link className={`${theme.attribution.link} border-r-1 last:border-r-0 px-1`} to={`${baseUrl || ""}/source/${source_id}`}>
                    {/*to={`/${isDms ? `forms` : damaBaseUrl}/source/${source_id}/${isDms ? `view` : `versions`}/${view_id}`}>*/}
                    {name} ({view_name}) {updatedTimeString ? `(${updatedTimeString})` : null}
                </Link>
            );
        });

        return (
            <div className={`${theme.attribution.wrapper}`}>
                <span className={theme.attribution.label}>Attribution:</span>
                {attribRows}
            </div>
        );
    } else {
        const { source_id, name, view_name, updated_at, baseUrl } = externalSource;
        const dateOptions = { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric" };
        const updatedTimeString = updated_at ? new Date(updated_at).toLocaleString(undefined, dateOptions) : null;
        return (
            <div className={`${theme.attribution.wrapper}`}>
                <span className={theme.attribution.label}>Attribution:</span>
                <Link className={theme.attribution.link} to={`${baseUrl || ""}/source/${source_id}`}>
                    {/*to={`/${isDms ? `forms` : damaBaseUrl}/source/${source_id}/${isDms ? `view` : `versions`}/${view_id}`}>*/}
                    {name} ({view_name}) {updatedTimeString ? `(${updatedTimeString})` : null}
                </Link>
            </div>
        );
    }



}