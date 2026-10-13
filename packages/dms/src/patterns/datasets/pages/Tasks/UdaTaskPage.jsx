import React from "react"
import { get } from "lodash-es"
import { DatasetsContext } from "../../context";
import { getExternalEnv } from "../../utils/datasources";
import Breadcrumbs from "../../components/Breadcrumbs";
import { ThemeContext } from "../../../../ui/useTheme";
import { dataItemsNav } from "../../../../utils/nav";
import { udaTaskPageTheme } from "./UdaTaskPage.theme";
import TaskTable from "../../components/TaskTable";
import { Link } from "react-router";

const EVENT_ATTRS = ["event_id", "task_id", "type", "message", "payload", "created_at"];

const DateCell = ({ value, ...rest }) => {
    if (!value) return <div {...rest}>—</div>;
    const myDate = new Date(String(value).replace(/"/g, ''));
    return <div {...rest}>{isNaN(myDate.getTime()) ? value : myDate.toLocaleString()}</div>;
};

// UI.Table columns (pre-v6, `t.table` ''). v6 builds plain-table columns from the theme (eventColumns).
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
            const { theme: colTheme } = React.useContext(ThemeContext) || {};
            const ct = { ...udaTaskPageTheme, ...(colTheme?.datasets?.udaTaskPage || {}) };
            if (!value) return <div {...rest}>—</div>;
            const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return value; } })() : value;
            const strValue = JSON.stringify(parsed, null, 2);
            return <textarea disabled
                className={`${ct.payloadTextarea} ${className}`}
                {...rest}
                value={strValue}
            />;
        },
    },
];

const parsePayload = (value) => {
    const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return value; } })() : value;
    return JSON.stringify(parsed, null, 2);
};

const fmtDate = (value) => {
    const myDate = new Date(String(value).replace(/"/g, ''));
    return isNaN(myDate.getTime()) ? value : myDate.toLocaleString();
};

const eventColumns = (t) => [
    { name: "event_id", display_name: "Event ID", Comp: ({ value }) => <span className={t.eventIdCell}>{value}</span> },
    { name: "type", display_name: "Type",
      Comp: ({ value }) => <span className={/ERROR/i.test(value || '') ? t.eventTypeError : t.eventTypeCell}>{value}</span> },
    { name: "message", display_name: "Message", Comp: ({ value }) => <div className={t.eventMessageCell}>{value}</div> },
    { name: "created_at", display_name: "Created at",
      Comp: ({ value }) => value ? <span className={t.eventDateCell}>{fmtDate(value)}</span> : <span className={t.emptyCell}>—</span> },
    { name: "payload", display_name: "Data",
      Comp: ({ value }) => value
          ? <textarea disabled rows={t.payloadRows || undefined} className={t.payloadTextarea} value={parsePayload(value)}/>
          : <span className={t.emptyCell}>—</span> },
];

const StatusBadge = ({status}) => {
    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...udaTaskPageTheme, ...(theme?.datasets?.udaTaskPage || {}) };
    const colors = {
        done: t.statusDone,
        error: t.statusError,
        running: t.statusRunning,
        queued: t.statusQueued,
    };
    return <span className={`${t.statusBadge} ${colors[status] || t.statusDefault}`}>
        {status === 'running' && t.statusRunningDot ? <span className={t.statusRunningDot}/> : null}{status}
    </span>;
};

const UdaTaskPage = ({params, pageSize = 20}) => {
    const taskId = params?.task_id || params?.etl_context_id;
    const ref = React.useRef();
    const { app, type, datasources, falcor, UI, baseUrl, parent } = React.useContext(DatasetsContext);
    // Tasks live in either DMS (`dms.tasks`) or DAMA (`data_manager.tasks`).
    // The server dispatches by env.includes('+'), and task_id sequences are
    // independent across backends — so task 6771 in DAMA is *not* the same
    // row as (any) task 6771 in DMS. To pick the right backend we probe
    // each candidate env in order until one returns a row for this task_id.
    // UdaTaskList queries DAMA first (it falls back to the external pgEnv),
    // so we use the same order here to stay consistent.
    const damaEnv = getExternalEnv(datasources);
    const envCandidates = React.useMemo(() => {
        const out = [];
        if (damaEnv) out.push(damaEnv);
        if (app && type) out.push(`${app}+${type}`);
        if (app) out.push(`${app}+_`);
        if (!out.includes('_+_')) out.push('_+_');
        return out;
    }, [app, type, damaEnv]);

    // `null`  = still probing
    // `''`    = no env has this task
    // string  = the env that owns this task
    const [pgEnv, setPgEnv] = React.useState(null);

    const {Table, Pagination, Layout, LayoutGroup} = UI;
    const [currentPage, setCurrentPage] = React.useState(0);
    const [data, setData] = React.useState({data: [], length: 0});
    const [taskInfo, setTaskInfo] = React.useState(null);

    // Probe candidate envs to discover which backend owns this task_id.
    React.useEffect(() => {
        if (!taskId || !falcor || envCandidates.length === 0) return;
        let cancelled = false;
        const probe = async () => {
            for (const env of envCandidates) {
                const res = await falcor.get(["uda", env, "tasks", "byId", +taskId, "task_id"]);
                if (cancelled) return;
                const found = get(res, ["json", "uda", env, "tasks", "byId", +taskId, "task_id"]);
                if (found != null) {
                    setPgEnv(env);
                    return;
                }
            }
            if (!cancelled) setPgEnv('');
        };
        probe();
        return () => { cancelled = true; };
    }, [falcor, taskId, envCandidates]);

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

    const { theme } = React.useContext(ThemeContext) || {};
    const t = { ...udaTaskPageTheme, ...(theme?.datasets?.udaTaskPage || {}) };
    const v6Columns = React.useMemo(() => eventColumns(t), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
    // Shared secondary nav — mount-aware base (pattern.navPrefix; '' on primary mounts) (see DatasetsList).
    const menuItemsSecondNav = React.useMemo(
        () => dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [], parent?.navPrefix || '', false),
        [theme?.navOptions?.secondaryNav?.navItems, parent?.navPrefix]
    );

    // v6 lays the page out directly; pre-v6 (t.page '') keeps the LayoutGroup
    const Body = t.page ? 'div' : LayoutGroup;
    // DMS tasks (env `app+type`) belong to internal sources — same split as SourcePage's pageBaseUrl
    const sourceBaseUrl = `${baseUrl}/${pgEnv?.includes('+') ? 'internal_source' : 'source'}`;
    const pagination = <Pagination currentPage={currentPage} setCurrentPage={setCurrentPage} pageSize={pageSize} usePagination={true}
        totalLength={data.length}/>;

    return (
        <Layout navItems={[]} secondNav={menuItemsSecondNav}>
            <Breadcrumbs items={[
                {icon: 'Database', href: baseUrl},
                {name: 'Tasks', href: `${baseUrl}/tasks`},
                {name: taskInfo?.source_name || `Task ${taskId}`},
            ]} />
            <Body className={t.page || undefined}>
                {taskInfo && (
                    <div className={t.taskInfoRow}>
                        <div className={t.taskInfoItem}><span className={t.taskInfoLabel}>Task{t.taskInfoSep}</span> <span className={t.taskInfoId}>{taskInfo.task_id}</span></div>
                        <div className={t.taskInfoStatus || t.taskInfoItem}><span className={t.taskInfoLabel}>Status{t.taskInfoSep}</span> <StatusBadge status={taskInfo.status} /></div>
                        <div className={t.taskInfoItem}><span className={t.taskInfoLabel}>Worker{t.taskInfoSep}</span> <span className={t.taskInfoWorker}>{(taskInfo.worker_path || '').replace(/\//g, ' ')}</span></div>
                        {taskInfo.source_name && <div className={t.taskInfoItem}><span className={t.taskInfoLabel}>Source{t.taskInfoSep}</span> {
                            t.taskInfoSourceLink && taskInfo.source_id
                                ? <Link className={t.taskInfoSourceLink} to={`${sourceBaseUrl}/${taskInfo.source_id}`}>{taskInfo.source_name}</Link>
                                : taskInfo.source_name
                        }</div>}
                        {taskInfo.progress > 0 && taskInfo.progress < 1 && (
                            <div className={t.taskInfoItem}><span className={t.taskInfoLabel}>Progress{t.taskInfoSep}</span> {Math.round(taskInfo.progress * 100)}%</div>
                        )}
                        {taskInfo.error && <div className={t.taskInfoError}><span className={t.taskInfoLabel}>Error{t.taskInfoSep}</span> {taskInfo.error}</div>}
                    </div>
                )}
                <div className={t.contentWrapper}>
                    {t.eventsHeader && pgEnv ? (
                        <div className={t.eventsHeader}>
                            <span className={t.eventsTitle}>Events</span>
                            <span className={t.eventsCount}>{data.length}</span>
                        </div>
                    ) : null}
                    {pgEnv === null ? (
                        <div className={t.lookupMsg}>Looking up task…</div>
                    ) : pgEnv === '' ? (
                        <div className={t.notFoundMsg}>Task {taskId} was not found in any configured environment ({envCandidates.join(', ')}).</div>
                    ) : data.length > 0 ? (
                        <>
                            {t.table
                                ? <TaskTable columns={v6Columns} data={data.data} t={t} striped/>
                                : <Table data={data.data} columns={COLUMNS} gridRef={ref} display={{striped: true}}/>}
                            {pagination}
                        </>
                    ) : (
                        <div className={t.noEventsMsg}>No events for this task.</div>
                    )}
                </div>
            </Body>
        </Layout>
    );
};

export default UdaTaskPage;
