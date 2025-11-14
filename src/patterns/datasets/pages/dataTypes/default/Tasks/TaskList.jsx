import React from "react";
import {Link} from "react-router";
import get from "lodash/get";

import {DatasetsContext} from "../../../../context";
import {ThemeContext} from "../../../../../../ui/useTheme";

export const ETL_CONTEXT_ATTRS = [
    "etl_status",
    "etl_context_id",
    "created_at",
    "terminated_at",
    "source_id",
    "parent_context_id",
    "type",
    //"duration",
    "payload",
    "user"
];

function timeAgo(input) {
    const date = (input instanceof Date) ? input : new Date(input);
    const formatter = new Intl.RelativeTimeFormat('en');
    const ranges = {
        years: 3600 * 24 * 365,
        months: 3600 * 24 * 30,
        weeks: 3600 * 24 * 7,
        days: 3600 * 24,
        hours: 3600,
        minutes: 60,
        seconds: 1
    };
    const secondsElapsed = (date.getTime() - Date.now()) / 1000;
    for (let key in ranges) {
        if (ranges[key] < Math.abs(secondsElapsed)) {
            const delta = secondsElapsed / ranges[key];
            return formatter.format(Math.round(delta), key);
        }
    }
}

const StartedAtCell = ({value, ...rest}) => <div {...rest}>{timeAgo(value)}</div>


const DurationCell = ({value, ...rest}) => {
    let formattedDuration = '';
    //under two seconds, show in MS
    if (parseInt(value) < 2000) {
        // const duration = moment(value).as('milliseconds');
        // r.duration = `${Math.round(duration)} ms`
        formattedDuration = `${value} ms`
    }
    //under 10 minutes, show in seconds
    else if (parseInt(value) < 600000) {
        // const duration = moment(value).as('seconds');
        // r.duration = `${Math.round(duration)} seconds`
        formattedDuration = `${Math.floor(value / 1000)} seconds`
    }
    //under 1 hour, show in minutes
    else if (parseInt(value) < 3600000) {
        formattedDuration = `${Math.floor(value / 1000 / 60)} minutes`
    }
    //show in hours
    else {
        // const duration = moment(value).as('minutes');
        // r.duration = `${Math.round(duration)} minutes`
        formattedDuration = `${Math.floor(value / 1000 / 60 / 60)} hours`
    }

    if (isNaN(formattedDuration)) {
        formattedDuration = "";
    }
    return (
        <div {...rest}>{formattedDuration}</div>
    )
}

export const UserCell = ({value, ...rest}) => {
    return (
        <div {...rest}>
            {
                typeof value === 'string' && value?.includes("@") ? value :
                    typeof value !== 'object' ? `User ${value}` : ``
            }
        </div>
    )
}

const TaskList = ({sourceId, pageSize = 5}) => {
    const ref = React.useRef();
    const {pgEnv, falcor, baseUrl, UI} = React.useContext(DatasetsContext);
    const {Table, Pagination} = UI;
    const [currentPage, setCurrentPage] = React.useState(0);
    const [data, setData] = React.useState({data: [], length: 0});

    const COLUMNS = [
        {
            name: "etl_context_id",
            display_name: "ETL Context ID",
            show: true,
            type: 'ui',
            Comp: ({value, ...rest}) => <Link to={`${baseUrl}/task/${value}`} {...rest}>{value}</Link>
        },
        {
            name: "type",
            display_name: "Type",
            show: true,
            type: 'ui',
            Comp: ({value, className, ...rest}) => {
                //Split off the ":initial"
                //replace hyphens with spaces
                //capitalize
                const formattedType = value.split(":")[0].replace("-", " ");
                return <div {...rest} className={`capitalize ${className}`}>{formattedType}</div>;
            }
        },
        {
            name: "source_name",
            display_name: "Source Name",
            show: true,
            type: 'ui',
            Comp: ({value, ...rest}) => <div {...rest}>{typeof value === 'string' ? value : ""}</div>
        },
        {
            name: "user",
            display_name: "User",
            show: true,
            type: 'ui',
            Comp: UserCell,
        },
        {name: "created_at", display_name: "Started", show: true, type: 'ui', Comp: StartedAtCell},
        {name: "duration", display_name: "Duration", show: true, type: 'ui', Comp: DurationCell},
        {name: "etl_status", display_name: "ETL Status", show: true},
    ];

    const dataLengthPath = sourceId
        ? ["dama", pgEnv, "latest", "events", "for", "source", sourceId, "length"]
        : ["dama", pgEnv, "latest", "events", "length"];

    //get length of data
    React.useEffect(() => {
        const load = async () => {
            const lenRes = await falcor.get(dataLengthPath);
            const length = get(lenRes, ['json', ...dataLengthPath]);
            if (!length) return;
            const from = currentPage * pageSize;
            const to = Math.min(length, from + pageSize) - 1

            if (from > to) return;

            const dataFetchPath =
                sourceId ? [
                        "dama",
                        pgEnv,
                        "latest",
                        "events",
                        "for",
                        "source",
                        sourceId,
                        {from, to},
                        ETL_CONTEXT_ATTRS,
                    ]
                    : ["dama", pgEnv, "latest", "events", {from, to}, ETL_CONTEXT_ATTRS];

            const dataPath = dataFetchPath.slice(0, dataFetchPath.length - 2);

            const sourceDataRes = await falcor.get(dataFetchPath);

            const sourceIds = Object.values(get(sourceDataRes, ["json", ...dataPath]))
                .map((etlContext) => etlContext.source_id)
                .filter((sourceId) => !!sourceId);

            const res = await falcor.get(["dama", pgEnv, "sources", "byId", sourceIds, "attributes", "name"]);
            const parsedRes = get(res, ['json', "dama", pgEnv, "sources", "byId"]);

            const data = Object.values(get(sourceDataRes, ["json", ...dataPath]))
                .map((r) => {
                    if (r.source_id) {
                        const sourceName = get(parsedRes, [r.source_id, "attributes", "name"]);
                        r.source_name = typeof sourceName === 'string' ? sourceName : '';
                    }
                    return r;
                })
                .filter((r) => Boolean(r.etl_context_id));
            setData({data, length});
        }
        load();
    }, [falcor, pgEnv, currentPage]);

    if (!data.length) return;

    return (
        <div className={'w-full'}>
            <Table data={data.data} columns={COLUMNS} gridRef={ref}/>
            <Pagination currentPage={currentPage} setCurrentPage={setCurrentPage} pageSize={pageSize} usePagination={true}
                        totalLength={data.length}/>
        </div>)
}
export default TaskList;
