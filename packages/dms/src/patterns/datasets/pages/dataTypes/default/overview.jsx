import React, {useMemo, useState, useRef, useContext} from 'react'
import {DatasetsContext} from "../../../context";
import {ThemeContext} from "../../../../../ui/useTheme";
import SourceCategories from "../../DatasetsList/categories";
import {Link} from "react-router";
import {isJson, updateSourceData, parseIfJson} from "./utils";
import { getExternalEnv } from "../../../utils/datasources";
import { OUTPUT_FILE_TYPES } from "../../../components/ExternalVersionControls";

const RenderPencil = ({theme = {}, editing, setEditing, attr, show}) => {
    if (!show) return null;

    return (
        <div className={theme.pencilWrapper || 'hidden group-hover:block text-blue-500 cursor-pointer'}
             onClick={e => editing === attr ? setEditing(null) : setEditing(attr)}>
            <i className={theme.pencilIcon || 'fad fa-pencil absolute -ml-4 p-2.5 rounded hover:bg-blue-500 hover:text-white'}/>
        </div>
    )
}

export default function Overview ({
  apiUpdate,
  format,
  source, setSource,
  params,
  isDms
}) {
    const ref = useRef(null);
    const {baseUrl, pageBaseUrl, user, isUserAuthed, UI, falcor, datasources, DAMA_HOST} = useContext(DatasetsContext);
    const { theme: fullTheme } = useContext(ThemeContext) || {};
    const theme = fullTheme?.datasets?.sourceOverview || {};
    const pgEnv = getExternalEnv(datasources);
    const {ColumnTypes, Table} = UI;

    const {id} = params;

    const [editing, setEditing] = useState();
    const [showAllColumns, setShowAllColumns] = useState(false);

    let columns = useMemo(() =>
        isDms ? isJson(source.config) ? JSON.parse(source.config)?.attributes : [] :
            (source?.metadata?.columns || []), [source.config, isDms, source?.metadata?.columns])

    const dateOptions = {year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric"}
    const createdTimeStamp = new Date(source?.created_at || '').toLocaleDateString(undefined, dateOptions);
    const updatedTimeStamp = new Date(source?.updated_at || '').toLocaleDateString(undefined, dateOptions);
    const DescComp = useMemo(() => editing === 'description' ? ColumnTypes.lexical.EditComp : ColumnTypes.lexical.ViewComp, [editing]);
    const CategoriesComp = SourceCategories;

    const LexicalView = ColumnTypes.lexical.ViewComp;

    return (
            <div className={'flex flex-col'}>
                <div className={theme.title || 'mt-1 text-2xl text-blue-600 font-medium overflow-hidden sm:mt-0 sm:col-span-3'}>
                    {source?.name || source?.doc_type}
                </div>

                <div className={theme.body || 'flex flex-col md:flex-row'}>
                    <div className={theme.descriptionCol || 'w-full md:w-[70%] pl-4 py-2 sm:pl-6 flex justify-between group text-sm text-gray-500 pr-14'}>
                        <DescComp
                            value={source?.description || 'No description'}
                            onChange={(data) => {
                                updateSourceData({data, attrKey: 'description', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                            }}
                        />
                        <RenderPencil theme={theme} attr={'description'} editing={editing} setEditing={setEditing} show={isUserAuthed(['update-source'])}/>
                    </div>

                    <div className={theme.metadataCol || 'w-full md:w-[30%] flex flex-col gap-1'}>
                        <div className={theme.metaItem || 'flex flex-col px-4 text-sm text-gray-600'}>
                            <span className={theme.metaLabel || 'text-sm text-gray-500'}>Created</span>
                            <span className={theme.metaValue || 'text-base font-medium text-blue-600'}>{createdTimeStamp}</span>
                        </div>

                        <div className={theme.metaItem || 'flex flex-col px-4 text-sm text-gray-600'}>
                            <span className={theme.metaLabel || 'text-sm text-gray-500'}>Updated</span>
                            <span className={theme.metaValue || 'text-base font-medium text-blue-600'}>{updatedTimeStamp}</span>
                        </div>

                        <div className={theme.metaItem || 'flex flex-col px-4 text-sm text-gray-600'}>
                            <span className={theme.metaLabel || 'text-sm text-gray-500'}>Type</span>
                            <span className={theme.metaValue || 'text-base font-medium text-blue-600'}>{source?.doc_type || source?.type}</span>
                        </div>

                        <div className={theme.metaEditRow || 'flex justify-between group'}>
                            <div className={theme.metaEditInner || 'flex-1 flex flex-col px-4'}>
                                <span className={theme.metaLabel || 'text-sm text-gray-500'}>Update Interval</span>
                                {
                                    editing === 'update_interval' ?
                                        <input className={'w-full'}
                                               autoFocus={true}
                                               value={source?.update_interval}
                                               onChange={e => {
                                                   updateSourceData({data: e.target.value, attrKey: 'update_interval', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                                               }}
                                        /> :
                                        <span className={theme.metaValue || 'text-base font-medium text-blue-600'}>{source?.update_interval}</span>
                                }
                            </div>
                            <RenderPencil theme={theme} attr={'update_interval'} editing={editing} setEditing={setEditing} show={isUserAuthed(['update-source'])}/>
                        </div>

                        <div className={theme.metaEditRow || 'flex justify-between group'}>
                            <div className={theme.metaEditInner || 'flex-1 flex flex-col px-4'}>
                                <span className={theme.metaLabel || 'text-sm text-gray-500'}>Categories</span>
                                <CategoriesComp
                                    value={Array.isArray(parseIfJson(source?.categories)) ? parseIfJson(source?.categories) : []}
                                    onChange={(data) => {
                                        updateSourceData({data, attrKey: 'categories', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                                    }}
                                    editingCategories={editing === 'categories'}
                                    stopEditingCategories={() => setEditing(null)}
                                />
                            </div>
                            <RenderPencil theme={theme} attr={'categories'} editing={editing} setEditing={setEditing} show={isUserAuthed(['update-source'])}/>
                        </div>
                    </div>
                </div>

                <div className={theme.sectionHeader || 'flex items-center p-2 mx-4 text-blue-600 hover:bg-blue-50 rounded-md'}>
                    Columns
                    <span className={theme.sectionBadge || 'bg-blue-200 text-blue-600 text-xs p-1 ml-2 shrink-0 grow-0 rounded-lg flex items-center justify-center border border-blue-300'}>
                    {columns.length}
                </span>
                </div>

                <div className={theme.tableWrapper || 'w-full p-4'}>
                    <div className={'[&>div]:max-h-none [&>div]:overflow-y-visible'}>
                        <Table
                            gridRef={ref}
                            columns={
                                ['display_name', 'description'].map(col => ({
                                    name: col,
                                    display_name: col,
                                    type: 'ui',
                                    Comp: ({value, row, ...rest}) => {
                                        return (
                                            <div {...rest}>
                                                {
                                                    col === 'display_name' ?
                                                        <div>
                                                            <span className={theme.columnName || 'font-semibold'}>{row?.display_name || row?.name}</span>
                                                            {' '}<span className={theme.columnType || 'font-light italic'}>{row?.type}</span>
                                                            {row?.display_name && row?.name && row.display_name !== row.name &&
                                                                <div className={theme.columnActualName || 'text-xs font-normal text-gray-400'}>{row.name}</div>
                                                            }
                                                        </div> :
                                                        <LexicalView value={row?.desc || row?.description} />
                                                }
                                            </div>
                                        )
                                    },
                                    show: true,
                                    align: 'left',
                                }))
                            }
                            data={showAllColumns ? columns : columns.slice(0, 15)}
                            display={{
                                striped: true
                            }}
                        />
                    </div>
                    {columns.length > 15 && (
                        <div className={theme.seeMoreLink || 'w-fit ml-auto mt-1 px-2 py-0.5 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded cursor-pointer transition-colors'}
                             onClick={() => setShowAllColumns(!showAllColumns)}
                        >{showAllColumns ? 'Show less' : `Show all ${columns.length} columns`}</div>
                    )}
                </div>

                <div className={theme.sectionHeader || 'flex items-center p-2 mx-4 text-blue-600 hover:bg-blue-50 rounded-md'}>
                    Versions
                    <span className={theme.sectionBadge || 'bg-blue-200 text-blue-600 text-xs p-1 ml-2 shrink-0 grow-0 rounded-lg flex items-center justify-center border border-blue-300'}>
                        {(source?.views || []).length}
                    </span>
                </div>

                <div className={theme.versionsWrapper || 'w-full p-4'}>
                    <Table
                        gridRef={ref}
                        columns={
                            ['name', 'created_at', 'updated_at', 'download'].map(col => ({
                                name: col,
                                display_name: col === 'created_at' ? 'created' : col === 'updated_at' ? 'updated' : col,
                                type: 'ui',
                                Comp: ({value, row, ...rest}) => {
                                    if (col === 'name') {
                                        return (
                                            <div {...rest}>
                                                <Link to={`${pageBaseUrl}/${params.id}/version/${row?.id || row?.view_id}`}>
                                                    {value || 'No Name'}
                                                </Link>
                                            </div>
                                        )
                                    }
                                    if (col === 'download') {
                                        const meta = typeof row?.metadata === 'string' ? parseIfJson(row.metadata, {}) : (row?.metadata || {});
                                        const downloads = meta?.download || {};
                                        const available = Object.keys(downloads).filter(k => OUTPUT_FILE_TYPES.includes(k));
                                        if (!available.length) {
                                            return <div {...rest} className={theme.downloadUnavailable || 'text-sm text-gray-400 italic'}>—</div>
                                        }
                                        return (
                                            <div {...rest} className={'flex gap-2'}>
                                                {available.map(fmt => (
                                                    <a key={fmt}
                                                       href={downloads[fmt].replace('$HOST', DAMA_HOST)}
                                                       className={theme.downloadLink || 'text-sm text-blue-600 hover:text-blue-800 hover:underline'}
                                                    >{fmt}</a>
                                                ))}
                                            </div>
                                        )
                                    }
                                    return (
                                        <div {...rest}>
                                            {new Date(value?.replace(/"/g, ''))?.toLocaleString()}
                                        </div>
                                    )
                                },
                                show: true,
                                align: 'left'
                            }))
                        }
                        data={(source?.views || [])}
                        pageSize={5}
                        striped={true}
                        sortBy={'created_at'}
                        sortOrder={'desc'}
                    />
                </div>

            </div>
    )
}
