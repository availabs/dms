import {Link} from "react-router-dom";
import React, {useContext} from "react";
import {SpreadSheetContext} from "../index";

    export const RenderAttribution = () => {
        const {state:{sourceInfo: {isDms, source_id, name, view_id, view_name, updated_at}, setState}} = useContext(SpreadSheetContext);
        const dateOptions = {year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"};
        const updatedTimeString = updated_at ? new Date(updated_at).toLocaleString(undefined, dateOptions) : null;

        return (
            <div className={'w-fit p-1 flex gap-1 text-xs text-gray-900'}>
                Attribution:
                <Link
                    to={`/${isDms ? `forms` : `cenrep`}/source/${source_id}/${isDms ? `view` : `versions`}/${view_id}`}>
                    {name} ({view_name}) {updatedTimeString ? `(${updatedTimeString})` : null}
                </Link>
            </div>
        )
}