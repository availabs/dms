import {Link} from "react-router-dom";
import React from "react";

    export const RenderAttribution = ({format, view}) => {
    const isDms = format.isDms
    const sourceName = format.name;
    const versionName = typeof view === 'object' ? view.name || view.version : view;
    const updatedTimestamp = view.updated_at || view._modified_timestamp;
        const dateOptions = {year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"}
        const updatedTimeString = updatedTimestamp ? new Date(updatedTimestamp).toLocaleString(undefined, dateOptions) : null
    return (
        <div className={'w-fit p-1 flex gap-1 text-xs text-gray-900'}>
            Attribution:
            <Link
                to={`/${isDms ? `forms` : `cenrep`}/source/${format.id}/${isDms ? `view` : `versions`}/${format.view_id}`}>
                {sourceName} ({versionName}) {updatedTimeString ? `(${updatedTimeString})` : null}
            </Link>
        </div>
    )
}