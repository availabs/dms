import React from "react";
import { Link } from "react-router";
import { get } from "lodash-es";

import { DatasetsContext } from "../../context";
import { getExternalEnv } from "../../utils/datasources";
import { ThemeContext } from "../../../../ui/useTheme";
import { udaTaskPageTheme } from "./UdaTaskPage.theme";
import { udaTaskListTheme } from "./UdaTaskList.theme";

const TASK_ATTRS = [
  "task_id",
  "status",
  "source_id",
  "worker_path",
  "progress",
  "queued_at",
  "started_at",
  "completed_at",
  "error",
];

function timeAgo(input) {
  if (!input) return "";
  const date = input instanceof Date ? input : new Date(input);
  if (isNaN(date.getTime())) return "";
  const formatter = new Intl.RelativeTimeFormat("en");
  const ranges = {
    years: 3600 * 24 * 365,
    months: 3600 * 24 * 30,
    weeks: 3600 * 24 * 7,
    days: 3600 * 24,
    hours: 3600,
    minutes: 60,
    seconds: 1,
  };
  const secondsElapsed = (date.getTime() - Date.now()) / 1000;
  for (let key in ranges) {
    if (ranges[key] < Math.abs(secondsElapsed)) {
      const delta = secondsElapsed / ranges[key];
      return formatter.format(Math.round(delta), key);
    }
  }
  return "just now";
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - start;
  if (isNaN(ms) || ms < 0) return "";
  if (ms < 2000) return `${ms} ms`;
  if (ms < 600000) return `${Math.floor(ms / 1000)} seconds`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)} minutes`;
  return `${Math.floor(ms / 3600000)} hours`;
}

// Status chip — styled by datasets.udaTaskPage (shared with the task page's own StatusBadge).
// The Table hands the cell its class + column props; keep the cell wrapper and put the pill inside,
// so the chip doesn't stretch to fill the cell.
const StatusBadge = ({ value, className = "" }) => {
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...udaTaskPageTheme, ...(theme?.datasets?.udaTaskPage || {}) };
  const colors = {
    done: t.statusDone,
    error: t.statusError,
    running: t.statusRunning,
    queued: t.statusQueued,
  };
  return (
    <div className={className}>
      <span className={`${t.statusBadge} ${colors[value] || t.statusDefault}`}>
        {value === "running" && t.statusRunningDot ? <span className={t.statusRunningDot}/> : null}
        {value}
      </span>
    </div>
  );
};

const UdaTaskList = ({ sourceId, pageSize = 10, env }) => {
  const ref = React.useRef();
  const { datasources, falcor, falcorCache, baseUrl, UI, user } =
    React.useContext(DatasetsContext);
  // `env` may be passed explicitly (DMS env like `app+instance` for
  // internal_table sources) or fall through to the pattern's external pgEnv
  // (DAMA tasks). Lets one component serve both backends — the UDA route
  // layer dispatches by env.includes('+').
  const pgEnv = env || getExternalEnv(datasources);
  const { Table, Pagination } = UI;
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...udaTaskListTheme, ...(theme?.datasets?.udaTaskList || {}) };
  const [currentPage, setCurrentPage] = React.useState(0);
  const [data, setData] = React.useState({ data: [], length: 0 });
  const [loaded, setLoaded] = React.useState(false);

  // UI.Table renders the list in every theme (`t.tableStyle`: the default theme's 'list'; '' on project
  // themes → their own table look). Each cell's wrapper takes the table's cell class (`className`); the
  // inner element takes this theme's class, so the two never compete on one element.

  const COLUMNS = [
    {
      name: "task_id",
      display_name: "Task ID",
      show: true,
      type: "ui",
      Comp: ({ value, className }) => (
        <div className={className}>
          <Link to={`${baseUrl}/task/${value}`} className={t.idLink}>{value}</Link>
        </div>
      ),
    },
    {
      name: "worker_path",
      display_name: "Type",
      show: true,
      type: "ui",
      Comp: ({ value, className }) => (
        <div className={className}>
          <span className={t.typeCell}>{(value || "").replace(/\//g, " ").replace(/-/g, " ")}</span>
        </div>
      ),
    },
    {
      name: "source_name",
      display_name: "Source",
      show: true,
      type: "ui",
      Comp: ({ value, className }) => (
        <div className={className}>{typeof value === "string" ? value : ""}</div>
      ),
    },
    {
      name: "status",
      display_name: "Status",
      show: true,
      type: "ui",
      Comp: StatusBadge,
    },
    {
      name: "queued_at",
      display_name: "Started",
      show: true,
      type: "ui",
      Comp: ({ value, className }) => (
        <div className={className}><span className={t.startedCell}>{timeAgo(value)}</span></div>
      ),
    },
    {
      name: "duration",
      display_name: "Duration",
      show: true,
      type: "ui",
      Comp: ({ value, className }) => (
        <div className={className}><span className={t.durationCell}>{value}</span></div>
      ),
    },
  ];

  React.useEffect(() => {
    if (!pgEnv || !falcor) return;

    const load = async () => {
      const lengthPath = sourceId
        ? ["uda", pgEnv, "tasks", "forSource", sourceId, "length"]
        : ["uda", pgEnv, "tasks", "length"];

      const lenRes = await falcor.get(lengthPath);
      const length = +get(lenRes, ["json", ...lengthPath], 0);
      if (!length) {
        setData({ data: [], length: 0 });
        setLoaded(true);
        return;
      }

      const from = currentPage * pageSize;
      const to = Math.min(length, from + pageSize) - 1;
      if (from > to) return;

      // Fetch byIndex with attributes in one call.
      // Falcor should follow the $ref from byIndex → byId and return resolved data.
      const dataPath = sourceId
        ? [
            "uda",
            pgEnv,
            "tasks",
            "forSource",
            +sourceId,
            "byIndex",
            { from, to },
            TASK_ATTRS,
          ]
        : ["uda", pgEnv, "tasks", "byIndex", { from, to }, TASK_ATTRS];

      const dataRes = await falcor.get(dataPath);

      // Read the resolved data from the response JSON.
      //
      // Falcor's `byIndex[i]` route returns `$ref(["uda", env, "tasks", "byId", taskId])`.
      // With a warm cache, the ref materializes inline at `byIndex[i]` (resolved object).
      // With a cold cache (e.g. after a page refresh), `byIndex[i]` stays as the
      // bare `{$type: "ref", value: [...]}` sentinel — but the byId attrs ARE
      // present in the same response under `byId[taskId]`. Follow the ref
      // ourselves so cold-cache renders show the same task rows as warm-cache ones.
      const basePath = sourceId
        ? ["json", "uda", pgEnv, "tasks", "forSource", +sourceId, "byIndex"]
        : ["json", "uda", pgEnv, "tasks", "byIndex"];
      const indexed = get(dataRes, basePath, {});
      const byIdMap = get(dataRes, ["json", "uda", pgEnv, "tasks", "byId"], {});

      const tasks = [];
      const sourceIds = [];

      for (let i = from; i <= to; i++) {
        let task = indexed[i];
        if (task && task.$type === "ref" && Array.isArray(task.value)) {
          // ref value path is ["uda", env, "tasks", "byId", taskId] — the taskId
          // is the last segment. Look the resolved object up in byIdMap.
          const refTaskId = task.value[task.value.length - 1];
          task = byIdMap[refTaskId];
        }
        if (!task || task.$type === "ref") continue;
        const taskId = task.task_id;
        if (!taskId && taskId !== 0) continue;

        tasks.push({
          ...task,
          duration: formatDuration(task.started_at, task.completed_at),
        });
        if (task.source_id) sourceIds.push(task.source_id);
      }

      // Fetch source names
      if (sourceIds.length) {
        const uniqueIds = [...new Set(sourceIds)];
        const nameRes = await falcor.get([
          "uda",
          pgEnv,
          "sources",
          "byId",
          uniqueIds,
          "name",
        ]);
        const sourceNames = get(
          nameRes,
          ["json", "uda", pgEnv, "sources", "byId"],
          {},
        );
        for (const task of tasks) {
          if (task.source_id && sourceNames[task.source_id]) {
            task.source_name = sourceNames[task.source_id].name || "";
          }
        }
      }

      setData({ data: tasks, length });
      setLoaded(true);
    };
    load();
  }, [falcor, pgEnv, currentPage, sourceId]);

  if (!data.length) {
    // Task reads need a signed-in user (permissions-ds-schedules-and-tasks): say so rather than "no tasks".
    if (!user?.authed) return (
      <div className={t.emptyWrapper}>
        <p className={t.emptyTitle}>Sign in to see tasks</p>
      </div>
    );
    // pre-v6 rendered nothing; v6 says so once the count has come back empty
    return loaded && t.emptyTitle ? (
      <div className={t.emptyWrapper}>
        <p className={t.emptyTitle}>No tasks yet</p>
        <p className={t.emptyText}>
          {sourceId
            ? "Loader runs, publishes and download builds for this source will show up here."
            : "Tasks appear here when a source is published, a loader runs, or downloads are built."}
        </p>
      </div>
    ) : null;
  }

  const pagination = (
    <Pagination
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      pageSize={pageSize}
      usePagination={true}
      totalLength={data.length}
    />
  );
  return (
    <div className={t.wrapper}>
      <Table data={data.data} columns={COLUMNS.map(c => ({ ...c, size: t.columnSizes?.[c.name] }))} gridRef={ref} isEdit={false} activeStyle={t.tableStyle || undefined} />
      {pagination}
    </div>
  );
};

export default UdaTaskList;
