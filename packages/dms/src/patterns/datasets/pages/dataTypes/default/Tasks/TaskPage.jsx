import React from "react"

import get from "lodash/get";
import { DatasetsContext } from "../../../../context";
import { getExternalEnv } from "../../../../utils/datasources";

import Breadcrumbs from "../../../../components/Breadcrumbs";
import { UserCell } from './TaskList';
import { ETL_CONTEXT_ATTRS } from './TaskList';

const getAttributes = (data) => {
    return Object.entries(data || {})
        .reduce((out, attr) => {
            const [k, v] = attr
            typeof v.value !== 'undefined' ?
                out[k] = v.value :
                out[k] = v
            return out
        }, {})
}

const DateCell = ({ value, ...rest }) => {
  const myDate = new Date(value.replace(/"/g, ''));

  return (
    <div {...rest}>{ myDate.toLocaleString() }</div>
  )
}

const COLUMNS = [
  { name: "etl_context_id", display_name: "ETL Context ID", show: true, size: 150 },
  {
    name: "event_id",
    display_name: "Event ID",
      show: true,
      size: 100
  },
  {
    name: "user",
    display_name: "User",
      show: true,
      type: 'ui',
      size: 150,
    Cell: UserCell
  },
  { name: "created_at", display_name: "Created At", show: true, type: 'ui', Cell: DateCell },
  { name: "type", display_name: "Type", show: true },
  {
    name: "payload",
    display_name: "Data",
      show: true,
      type: 'ui',
      size: 450,
    Comp: ({ value, className='', ...rest }) => {
      const parsedValue = typeof value === 'string' ? JSON.parse(value) : value;
      const displayValue = parsedValue?.data || parsedValue?.message || parsedValue;
      const classes =
          className
              .replaceAll('\n', ' ')
              .replaceAll('\t', ' ')
              .split(' ')
              .filter(c => c && c.length && !c.includes('w-') && !c.includes('h-') && !c.includes('flex') && !c.includes('truncate'))
              .join(' ')
        const strValue = JSON.stringify(displayValue, null, 2);
      const height = strValue.length > 150 ? `h-[500px]` : `h-fit`;
      return <textarea disabled
                       className={`${classes} w-full ${height} max-h-[150px] overflow-auto text-wrap scrollbar-sm`}
                       {...rest}
                       value={strValue}
      />;
    },
  },
];
const TaskPageComponent = ({params, pageSize = 10}) => {
  const { etl_context_id } = params;
  const ref = React.useRef();
  const { datasources, falcor, UI, baseUrl } = React.useContext(DatasetsContext);
  const pgEnv = getExternalEnv(datasources);
  const {Table, Pagination, Layout, LayoutGroup} = UI;
  const [currentPage, setCurrentPage] = React.useState(0);
  const [data, setData] = React.useState({data: [], length: 0});
  const [sourceName, setSourceName] = React.useState('');

  const EVENT_LENGTH_PATH = [
    "dama",
    pgEnv,
    "etlContexts",
    etl_context_id,
    "allEvents",
    "length",
  ];

  // Fetch source name for breadcrumb
  React.useEffect(() => {
    async function fetchName() {
      const data = await falcor.get([
        "dama", pgEnv, "etlContexts", "byEtlContextId",
        etl_context_id, "attributes", ETL_CONTEXT_ATTRS,
      ])
      const etlAttr = getAttributes(
        get(data, ["json", "dama", pgEnv, "etlContexts", "byEtlContextId", etl_context_id], {attributes: {}})
      );
      if (Object.keys(etlAttr).length && etlAttr?.meta?.source_id) {
        const namePath = ["dama", pgEnv, "sources", "byId", [etlAttr.meta.source_id], "attributes", "name"];
        const nameRes = await falcor.get(namePath);
        setSourceName(get(nameRes, ['json', ...namePath]) || '');
      }
    }
    if (etl_context_id) fetchName();
  }, [falcor, etl_context_id, pgEnv]);

  //get length of data
  React.useEffect(() => {
    const load = async () => {
      const lenRes = await falcor.get(EVENT_LENGTH_PATH);
      const length = +get(lenRes, ['json', ...EVENT_LENGTH_PATH], 0);
      if(!length) return;

        const from = currentPage * pageSize;
        const to = Math.min(length, from + pageSize) - 1

        if (from > to) return;

      const dataFetchPath = [
          "dama",
          pgEnv,
          "etlContexts",
          etl_context_id,
          "allEvents",
          {from, to},
          ["event_id","etl_context_id", "created_at", "type", "payload", "user"]
      ];
        const dataPath = dataFetchPath.slice(0, dataFetchPath.length - 2);

        const dataRes = await falcor.get(dataFetchPath)
        const data = Object.values(get(dataRes, ["json", ...dataPath], {})).filter(r => Boolean(r.etl_context_id))
        setData({data, length});
    }
    load();
  }, [falcor, pgEnv, currentPage]);

    if (!data.length) return;

    return (
        <Layout navItems={[]}>
            <Breadcrumbs items={[
                {icon: 'Database', href: baseUrl},
                {name: 'Tasks', href: `${baseUrl}/tasks`},
                {name: sourceName || etl_context_id},
            ]} />
            <LayoutGroup>
                <div className={'w-full'}>
                    <Table data={data.data} columns={COLUMNS} gridRef={ref} display={{striped: true}}/>
                    <Pagination currentPage={currentPage} setCurrentPage={setCurrentPage} pageSize={pageSize} usePagination={true}
                                totalLength={data.length}/>
                </div>
            </LayoutGroup>
        </Layout>
    )

}
export default TaskPageComponent;
