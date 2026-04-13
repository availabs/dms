import React from "react";
import {Link} from "react-router";
import { get } from "lodash-es"

import {DatasetsContext} from "../../context";
import { getExternalEnv } from "../../utils/datasources";

const TASK_ATTRS = [
    "task_id", "status", "source_id", "worker_path", "progress",
    "queued_at", "started_at", "completed_at", "error"
];

function timeAgo(input) {
    if (!input) return '';
    const date = (input instanceof Date) ? input : new Date(input);
    if (isNaN(date.getTime())) return '';
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
    return 'just now';
}

function formatDuration(startedAt, completedAt) {
    if (!startedAt) return '';
    const start = new Date(startedAt).getTime();
    const end = completedAt ? new Date(completedAt).getTime() : Date.now();
    const ms = end - start;
    if (isNaN(ms) || ms < 0) return '';
    if (ms < 2000) return `${ms} ms`;
    if (ms < 600000) return `${Math.floor(ms / 1000)} seconds`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)} minutes`;
    return `${Math.floor(ms / 3600000)} hours`;
}

const StatusBadge = ({value, className = '', ...rest}) => {
    const colors = {
        done: 'bg-green-100 text-green-800',
        error: 'bg-red-100 text-red-800',
        running: 'bg-blue-100 text-blue-800',
        queued: 'bg-gray-100 text-gray-600',
    };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[value] || 'bg-gray-100'} ${className}`} {...rest}>{value}</span>;
};

const UdaTaskList = ({sourceId, pageSize = 10}) => {
    const ref = React.useRef();
    const {datasources, falcor, baseUrl, UI} = React.useContext(DatasetsContext);
    const pgEnv = getExternalEnv(datasources);
    const {Table, Pagination} = UI;
    const [currentPage, setCurrentPage] = React.useState(0);
    const [data, setData] = React.useState({data: [], length: 0});

    const COLUMNS = [
        {
            name: "task_id",
            display_name: "Task ID",
            show: true,
            type: 'ui',
            Comp: ({value, ...rest}) => <Link to={`${baseUrl}/task-new/${value}`} {...rest}>{value}</Link>
        },
        {
            name: "worker_path",
            display_name: "Type",
            show: true,
            type: 'ui',
            Comp: ({value, className, ...rest}) => {
                const formatted = (value || '').replace(/\//g, ' ').replace(/-/g, ' ');
                return <div {...rest} className={`capitalize ${className}`}>{formatted}</div>;
            }
        },
        {
            name: "source_name",
            display_name: "Source",
            show: true,
            type: 'ui',
            Comp: ({value, ...rest}) => <div {...rest}>{typeof value === 'string' ? value : ""}</div>
        },
        {
            name: "status",
            display_name: "Status",
            show: true,
            type: 'ui',
            Comp: StatusBadge,
        },
        {
            name: "queued_at",
            display_name: "Started",
            show: true,
            type: 'ui',
            Comp: ({value, ...rest}) => <div {...rest}>{timeAgo(value)}</div>
        },
        {
            name: "duration",
            display_name: "Duration",
            show: true,
        },
    ];

    React.useEffect(() => {
        if (!pgEnv || !falcor) return;

        const load = async () => {
            // Get length
            const lengthPath = sourceId
                ? ["uda", pgEnv, "tasks", "forSource", sourceId, "length"]
                : ["uda", pgEnv, "tasks", "length"];

            const lenRes = await falcor.get(lengthPath);
            const length = +get(lenRes, ['json', ...lengthPath], 0);
            if (!length) { setData({data: [], length: 0}); return; }

            const from = currentPage * pageSize;
            const to = Math.min(length, from + pageSize) - 1;
            if (from > to) return;

            // Get task IDs via byIndex (returns $ref to byId)
            const indexPath = sourceId
                ? ["uda", pgEnv, "tasks", "forSource", sourceId, "byIndex", {from, to}]
                : ["uda", pgEnv, "tasks", "byIndex", {from, to}];

            await falcor.get(indexPath);

            // Now fetch task attributes via byId — the refs from byIndex point here
            // We need to follow the refs, so fetch the full path with attrs
            const taskAttrPath = sourceId
                ? ["uda", pgEnv, "tasks", "forSource", sourceId, "byIndex", {from, to}, TASK_ATTRS]
                : ["uda", pgEnv, "tasks", "byIndex", {from, to}, TASK_ATTRS];

            const dataRes = await falcor.get(taskAttrPath);

            // Extract tasks from the byIndex response
            const basePath = sourceId
                ? ["json", "uda", pgEnv, "tasks", "forSource", sourceId, "byIndex"]
                : ["json", "uda", pgEnv, "tasks", "byIndex"];

            const indexed = get(dataRes, basePath, {});
            const tasks = [];
            const sourceIds = [];

            for (let i = from; i <= to; i++) {
                const task = indexed[i];
                if (task && task.task_id) {
                    tasks.push({
                        ...task,
                        duration: formatDuration(task.started_at, task.completed_at),
                    });
                    if (task.source_id) sourceIds.push(task.source_id);
                }
            }

            // Fetch source names
            if (sourceIds.length) {
                const uniqueIds = [...new Set(sourceIds)];
                const nameRes = await falcor.get(["uda", pgEnv, "sources", "byId", uniqueIds, "name"]);
                const sourceNames = get(nameRes, ["json", "uda", pgEnv, "sources", "byId"], {});
                for (const task of tasks) {
                    if (task.source_id && sourceNames[task.source_id]) {
                        task.source_name = sourceNames[task.source_id].name || '';
                    }
                }
            }

            setData({data: tasks, length});
        };
        load();
    }, [falcor, pgEnv, currentPage, sourceId]);

    if (!data.length) return null;

    return (
        <div className={'w-full'}>
            <Table data={data.data} columns={COLUMNS} gridRef={ref}/>
            <Pagination
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                pageSize={pageSize}
                usePagination={true}
                totalLength={data.length}
            />
        </div>
    );
};

export default UdaTaskList;
