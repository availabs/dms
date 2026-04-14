import React from "react"
import { get } from "lodash-es"
import { DatasetsContext } from "../../context";
import { getExternalEnv } from "../../utils/datasources";
import Breadcrumbs from "../../components/Breadcrumbs";

const EVENT_ATTRS = ["event_id", "task_id", "type", "message", "payload", "created_at"];

const DateCell = ({ value, ...rest }) => {
    if (!value) return <div {...rest}>—</div>;
    const myDate = new Date(String(value).replace(/"/g, ''));
    return <div {...rest}>{isNaN(myDate.getTime()) ? value : myDate.toLocaleString()}</div>;
};

const COLUMNS = [
    { name: "event_id", display_name: "Event ID", show: true, size: 100 },
    { name: "type", display_name: "Type", show: true },
    { name: "message", display_name: "Message", show: true },
    { name: "created_at", display_name: "Created At", show: true, type: 'ui', Comp: DateCell },
    {
        name: "payload",
        display_name: "Data",
        show: true,
        size: 450,
        type: 'ui',
        Comp: ({ value, className = '', ...rest }) => {
            if (!value) return <div {...rest}>—</div>;
            const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return value; } })() : value;
            const strValue = JSON.stringify(parsed, null, 2);
            return <textarea disabled
                className={`w-full max-h-[150px] overflow-auto text-wrap scrollbar-sm text-xs ${className}`}
                {...rest}
                value={strValue}
            />;
        },
    },
];

const StatusBadge = ({status}) => {
    const colors = {
        done: 'bg-green-100 text-green-800',
        error: 'bg-red-100 text-red-800',
        running: 'bg-blue-100 text-blue-800',
        queued: 'bg-gray-100 text-gray-600',
    };
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-gray-100'}`}>{status}</span>;
};

const UdaTaskPage = ({params, pageSize = 20}) => {
    const taskId = params?.task_id || params?.etl_context_id;
    const ref = React.useRef();
    const { datasources, falcor, UI, baseUrl } = React.useContext(DatasetsContext);
    const pgEnv = getExternalEnv(datasources);
    const {Table, Pagination, Layout, LayoutGroup} = UI;
    const [currentPage, setCurrentPage] = React.useState(0);
    const [data, setData] = React.useState({data: [], length: 0});
    const [taskInfo, setTaskInfo] = React.useState(null);

    // Fetch task info
    React.useEffect(() => {
        if (!taskId || !pgEnv || !falcor) return;
        const load = async () => {
            const taskAttrs = ["task_id", "status", "source_id", "worker_path", "progress", "error", "queued_at", "started_at", "completed_at"];
            const res = await falcor.get(["uda", pgEnv, "tasks", "byId", +taskId, taskAttrs]);
            const task = get(res, ["json", "uda", pgEnv, "tasks", "byId", +taskId], {});

            let sourceName = '';
            if (task.source_id) {
                const nameRes = await falcor.get(["uda", pgEnv, "sources", "byId", task.source_id, "name"]);
                sourceName = get(nameRes, ["json", "uda", pgEnv, "sources", "byId", task.source_id, "name"], '');
            }

            setTaskInfo({ ...task, source_name: sourceName });
        };
        load();
    }, [falcor, taskId, pgEnv]);

    // Fetch events
    React.useEffect(() => {
        if (!taskId || !pgEnv || !falcor) return;
        const load = async () => {
            const lenPath = ["uda", pgEnv, "tasks", "byId", +taskId, "events", "length"];
            const lenRes = await falcor.get(lenPath);
            const length = +get(lenRes, ['json', ...lenPath], 0);
            if (!length) { setData({data: [], length: 0}); return; }

            const from = currentPage * pageSize;
            const to = Math.min(length, from + pageSize) - 1;
            if (from > to) return;

            const dataPath = ["uda", pgEnv, "tasks", "byId", +taskId, "events", "byIndex", {from, to}, EVENT_ATTRS];
            const dataRes = await falcor.get(dataPath);

            const indexed = get(dataRes, ["json", "uda", pgEnv, "tasks", "byId", +taskId, "events", "byIndex"], {});
            const events = [];
            for (let i = from; i <= to; i++) {
                if (indexed[i] && indexed[i].event_id) {
                    events.push(indexed[i]);
                }
            }

            setData({data: events, length});
        };
        load();
    }, [falcor, pgEnv, taskId, currentPage]);

    return (
        <Layout navItems={[]}>
            <Breadcrumbs items={[
                {icon: 'Database', href: baseUrl},
                {name: 'Tasks', href: `${baseUrl}/tasks-new`},
                {name: taskInfo?.source_name || `Task ${taskId}`},
            ]} />
            <LayoutGroup>
                {taskInfo && (
                    <div className="flex flex-wrap gap-4 mb-4 text-sm">
                        <div><span className="text-gray-500">Task:</span> {taskInfo.task_id}</div>
                        <div><span className="text-gray-500">Status:</span> <StatusBadge status={taskInfo.status} /></div>
                        <div><span className="text-gray-500">Worker:</span> <span className="capitalize">{(taskInfo.worker_path || '').replace(/\//g, ' ')}</span></div>
                        {taskInfo.source_name && <div><span className="text-gray-500">Source:</span> {taskInfo.source_name}</div>}
                        {taskInfo.error && <div className="text-red-600 w-full"><span className="text-gray-500">Error:</span> {taskInfo.error}</div>}
                        {taskInfo.progress > 0 && taskInfo.progress < 1 && (
                            <div><span className="text-gray-500">Progress:</span> {Math.round(taskInfo.progress * 100)}%</div>
                        )}
                    </div>
                )}
                <div className={'w-full'}>
                    {data.length > 0 ? (
                        <>
                            <Table data={data.data} columns={COLUMNS} gridRef={ref} display={{striped: true}}/>
                            <Pagination currentPage={currentPage} setCurrentPage={setCurrentPage} pageSize={pageSize} usePagination={true}
                                totalLength={data.length}/>
                        </>
                    ) : (
                        <div className="text-gray-400 text-sm py-4">No events for this task.</div>
                    )}
                </div>
            </LayoutGroup>
        </Layout>
    );
};

export default UdaTaskPage;
