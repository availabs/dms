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
    const isJoinPresent =
      !!join &&
      (Object.keys(join.sources || {}).length > 1 ||
        (Object.keys(join.sources || {}).length === 1 && Object.keys(join.sources || {})[0] !== "ds"));

    let attribRows = [];
    const { source_id, name, view_name, view_id, updated_at, baseUrl } = externalSource;
    const dateOptions = { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric" };
    const updatedTimeString = updated_at ? new Date(updated_at).toLocaleString(undefined, dateOptions) : null;
    attribRows.push(
      <Link className={`${theme.attribution.link} border-r-1 last:border-r-0 px-1`} to={`${baseUrl || ""}/source/${source_id}`}>
        {/*to={`/${isDms ? `forms` : damaBaseUrl}/source/${source_id}/${isDms ? `view` : `versions`}/${view_id}`}>*/}
        {name} ({view_name || view_id}) {updatedTimeString ? `(${updatedTimeString})` : null}
      </Link>,
    );

    if (isJoinPresent) {
        //need a row for each source in join
        Object.keys(join.sources).forEach((sourceAlias) => {
            const curJoinSource = join.sources[sourceAlias];
            const { mergeStrategy } = curJoinSource;
            const attribSource = curJoinSource?.sourceInfo;
            const { source_id, name, view_name, updated_at, baseUrl } = attribSource;

            const dateOptions = { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric" };
            const updatedTimeString = updated_at ? new Date(updated_at).toLocaleString(undefined, dateOptions) : null;
            attribRows.push((
                <Link key={`${sourceAlias}_attribution`} className={`${theme.attribution.link} border-r-1 last:border-r-0 px-1`} to={`${baseUrl || ""}/source/${source_id}`}>
                    {/*to={`/${isDms ? `forms` : damaBaseUrl}/source/${source_id}/${isDms ? `view` : `versions`}/${view_id}`}>*/}
                    <span className="capitalize">({mergeStrategy || "Join"})</span> {name} ({view_name || curJoinSource.view}) {updatedTimeString ? `(${updatedTimeString})` : null}
                </Link>
            ));
        });
    }



    return (
        <div className={`${theme.attribution.wrapper}`}>
            <span className={theme.attribution.label}>Attribution:</span>
            {attribRows}
        </div>
    );
    



}