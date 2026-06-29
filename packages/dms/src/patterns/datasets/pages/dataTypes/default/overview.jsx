import React, {useMemo, useState, useContext} from 'react'
import {DatasetsContext} from "../../../context";
import {ThemeContext, getComponentTheme} from "../../../../../ui/useTheme";
import SourceCategories from "../../DatasetsList/categories";
import {Link} from "react-router";
import {isJson, updateSourceData, parseIfJson} from "./utils";
import { getExternalEnv } from "../../../utils/datasources";
import { OUTPUT_FILE_TYPES } from "../../../components/ExternalVersionControls";
import { sourceOverviewTheme } from "./sourceOverview.theme";
import { FALLBACK_SWATCHES, catColor, splitCategories } from "../../../utils/categoryColors";

// admin-only corner edit affordance — toggles `editing` for the given attr
const RenderPencil = ({t, Icon, editing, setEditing, attr, show, title}) => {
    if (!show) return null;
    return (
        <button type="button"
                className={t.editBtn}
                title={title || 'Edit · admin'}
                onClick={() => setEditing(editing === attr ? null : attr)}>
            <Icon icon="PencilSquare" className={t.editIcon}/>
        </button>
    )
}

export default function Overview ({
  apiUpdate,
  format,
  source, setSource,
  params,
  isDms
}) {
    const {pageBaseUrl, isUserAuthed, UI, falcor, datasources, DAMA_HOST} = useContext(DatasetsContext);
    const { theme: fullTheme } = useContext(ThemeContext) || {};
    const t = {...sourceOverviewTheme, ...getComponentTheme(fullTheme, 'datasets.sourceOverview')};
    const pgEnv = getExternalEnv(datasources);
    const {ColumnTypes, Icon} = UI;

    const {id} = params;
    const isAdmin = isUserAuthed(['update-source']);

    const [editing, setEditing] = useState();
    const [showAllColumns, setShowAllColumns] = useState(false);
    const [openDownload, setOpenDownload] = useState(null);
    const views = parseIfJson(source?.views) || [];

    let columns = useMemo(() => {
        if (isDms) {
            return (isJson(source.config) ? JSON.parse(source.config)?.attributes : null) || [];
        }
        return source?.metadata?.columns || (Array.isArray(source?.metadata) ? source.metadata : []);
    }, [source.config, isDms, source?.metadata?.columns])

    const dateOptions = {year: "numeric", month: "long", day: "numeric"};
    const fmtDate = (v) => v ? new Date(String(v).replace(/"/g, '')).toLocaleDateString(undefined, dateOptions) : '—';
    const createdTimeStamp = fmtDate(source?.created_at);
    const updatedTimeStamp = fmtDate(source?.updated_at);

    const DescComp = useMemo(() => editing === 'description' ? ColumnTypes.lexical.EditComp : ColumnTypes.lexical.ViewComp, [editing]);
    const LexicalView = ColumnTypes.lexical.ViewComp;

    const COLUMN_PREVIEW = 8;
    const visibleColumns = showAllColumns ? columns : (columns || []).slice(0, COLUMN_PREVIEW);
    const isColRequired = (col) => col?.required === true || col?.nullable === false || /not\s*null/i.test(col?.constraints || '');

    // latest view == current (SourcePage treats views[last] as latest); display newest-first
    const latestId = views.length ? (isDms ? views[views.length - 1]?.id : views[views.length - 1]?.view_id) : null;
    const orderedViews = [...views].reverse();

    // categories — colored area pills (view) + the SourceCategories editor (edit)
    const categoriesValue = Array.isArray(parseIfJson(source?.categories)) ? parseIfJson(source?.categories) : [];
    const swatches = t.catSwatches || FALLBACK_SWATCHES;
    const { tops: catTops, subs: catSubs } = splitCategories({ categories: categoriesValue });

    return (
            <div className={t.grid}>

                {/* ── MAIN ─────────────────────────────────────────── */}
                <div className={t.mainCol}>

                    {/* Description (Lexical) */}
                    <div className={t.descCard}>
                        <RenderPencil t={t} Icon={Icon} attr={'description'} editing={editing} setEditing={setEditing} show={isAdmin} title={'Edit description · admin'}/>
                        <div className={t.eyebrow}>Description</div>
                        <div className={t.descProse}>
                            <DescComp
                                hideControls={true}
                                value={source?.description || 'No description'}
                                onChange={(data) => {
                                    updateSourceData({data, attrKey: 'description', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                                }}
                            />
                        </div>
                    </div>

                    {/* Columns summary (config.attributes / metadata.columns) */}
                    <div className={t.colCard}>
                        <div className={t.colHeader}>
                            <span className={t.colHeaderTitle}>Columns · {columns?.length || 0}</span>
                            {isAdmin && (
                                <Link to={`${pageBaseUrl}/${id}/metadata`} className={t.colEditBtn}>
                                    Edit columns<span className={t.adminPill}>admin</span>
                                </Link>
                            )}
                            <Link to={`${pageBaseUrl}/${id}/metadata`} className={t.colMetaLink}>Full metadata →</Link>
                        </div>
                        <table className={t.table}>
                            <thead>
                                <tr className={t.theadRow}>
                                    <th className={t.th}>Column</th>
                                    <th className={t.th}>Type</th>
                                    <th className={t.th}>Description</th>
                                    <th className={t.thReq}>Req</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleColumns.map((col, i) => (
                                    <tr key={col?.name || i} className={i % 2 ? t.trAlt : t.tr}>
                                        <td className={t.tdName}>{col?.name}</td>
                                        <td className={t.tdType}>{col?.type}</td>
                                        <td className={t.tdDesc}><LexicalView value={col?.desc || col?.description}/></td>
                                        <td className={t.tdReq}>
                                            <span className={isColRequired(col) ? t.reqYes : t.reqNo}>{isColRequired(col) ? '●' : '○'}</span>
                                        </td>
                                    </tr>
                                ))}
                                {!columns?.length && (
                                    <tr className={t.tr}><td className={t.tdEmpty} colSpan={4}>No columns defined</td></tr>
                                )}
                            </tbody>
                        </table>
                        {columns?.length > COLUMN_PREVIEW && (
                            <button type="button" className={t.colFooter} onClick={() => setShowAllColumns(!showAllColumns)}>
                                {showAllColumns ? 'Show fewer' : `+ ${columns.length - COLUMN_PREVIEW} more columns`}
                            </button>
                        )}
                    </div>
                </div>

                {/* ── SIDE ─────────────────────────────────────────── */}
                <div className={t.sideCol}>

                    {/* At a glance */}
                    <div className={t.glanceCard}>
                        <div className={t.eyebrow}>At a glance</div>
                        <dl className={t.glanceList}>
                            <div className={t.glanceRow}><dt className={t.glanceLabel}>Type</dt><dd className={t.glanceValue}>{source?.type || '—'}</dd></div>
                            <div className={t.glanceRow}><dt className={t.glanceLabel}>Columns</dt><dd className={t.glanceValueNum}>{columns?.length || 0}</dd></div>
                            <div className={t.glanceRow}><dt className={t.glanceLabel}>Versions</dt><dd className={t.glanceValueNum}>{views.length}</dd></div>
                            <div className={`${t.glanceRow} group`}>
                                <dt className={t.glanceLabel}>Update interval</dt>
                                <dd className={t.glanceValueEdit}>
                                    {editing === 'update_interval'
                                        ? <input className={t.glanceInput} autoFocus value={source?.update_interval || ''}
                                                 onChange={e => updateSourceData({data: e.target.value, attrKey: 'update_interval', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})}/>
                                        : <span className={t.glanceValue}>{source?.update_interval || '—'}</span>}
                                    {isAdmin && (
                                        <button type="button" className={t.glanceEditBtn} title={'Edit update interval · admin'}
                                                onClick={() => setEditing(editing === 'update_interval' ? null : 'update_interval')}>
                                            <Icon icon="PencilSquare" className={t.glanceEditIcon}/>
                                        </button>
                                    )}
                                </dd>
                            </div>
                            <div className={t.glanceRow}><dt className={t.glanceLabel}>Created</dt><dd className={t.glanceValue}>{createdTimeStamp}</dd></div>
                            <div className={t.glanceRow}><dt className={t.glanceLabel}>Updated</dt><dd className={t.glanceValue}>{updatedTimeStamp}</dd></div>
                        </dl>
                    </div>

                    {/* Categories (the category-tagging pass) */}
                    <div className={t.catCard}>
                        <RenderPencil t={t} Icon={Icon} attr={'categories'} editing={editing} setEditing={setEditing} show={isAdmin} title={'Edit categories · admin'}/>
                        <div className={t.eyebrow}>Categories</div>
                        {editing === 'categories' ? (
                            <SourceCategories
                                value={categoriesValue}
                                onChange={(data) => {
                                    updateSourceData({data, attrKey: 'categories', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                                }}
                                editingCategories={true}
                                stopEditingCategories={() => setEditing(null)}
                            />
                        ) : (
                            <div className={t.catPills}>
                                {(catTops.length || catSubs.length) ? (
                                    <>
                                        {catTops.map(area => (
                                            <span key={area} className={t.catPill} style={{'--cat': catColor(area, swatches)}}>
                                                <span className={t.catDot} style={{backgroundColor: catColor(area, swatches)}}/>{area}
                                            </span>
                                        ))}
                                        {catSubs.map(s => <span key={s.path} className={t.catSubPill}>{s.label}</span>)}
                                    </>
                                ) : <span className={t.catEmpty}>No categories</span>}
                            </div>
                        )}
                        <div className={t.catHelp}>Drives placement in the catalog rail and the public site nav.</div>
                    </div>

                    {/* Versions · per-view download menu (OUTPUT_FILE_TYPES) */}
                    <div className={t.verCard}>
                        <div className={t.verHeader}>
                            <span className={t.verHeaderTitle}>Versions</span>
                            <span className={t.verHeaderCount}>{views.length} {views.length === 1 ? 'version' : 'versions'}</span>
                        </div>
                        <div className={t.verList}>
                            {!views.length && <div className={t.verEmpty}>No versions yet</div>}
                            {orderedViews.map((view, i) => {
                                const viewId = isDms ? view?.id : view?.view_id;
                                const meta = typeof view?.metadata === 'string' ? parseIfJson(view.metadata, {}) : (view?.metadata || {});
                                const downloads = meta?.download || {};
                                const available = Object.keys(downloads).filter(k => OUTPUT_FILE_TYPES.includes(k));
                                const isCurrent = viewId != null && viewId === latestId;
                                const open = openDownload === viewId;
                                return (
                                    <div key={viewId || i} className={t.verRow}>
                                        <div className={t.verRowTop}>
                                            <div className={t.verRowMain}>
                                                <div className={t.verNameRow}>
                                                    <Link to={`${pageBaseUrl}/${id}/version/${viewId}`} className={t.verName}>{view?.name || (viewId != null ? `v${viewId}` : 'No Name')}</Link>
                                                    {isCurrent && <span className={t.verCurrentBadge}>current</span>}
                                                </div>
                                                <div className={t.verMeta}>
                                                    {view?.row_count ? `${Number(view.row_count).toLocaleString()} rows · ` : ''}
                                                    {view?.created_at ? `published ${fmtDate(view.created_at)}` : ''}
                                                </div>
                                            </div>
                                            {available.length > 0 && (
                                                <div className={t.verDownloadWrap}>
                                                    <button type="button"
                                                            className={isCurrent ? t.verDownloadBtnPrimary : t.verDownloadBtn}
                                                            onClick={() => setOpenDownload(open ? null : viewId)}>
                                                        <Icon icon="Download" className={t.verDownloadIcon}/>Download
                                                        <Icon icon={open ? "CaretUp" : "CaretDown"} className={t.verCaretIcon}/>
                                                    </button>
                                                    {open && (
                                                        <div className={t.verMenu}>
                                                            {available.map(fmt => (
                                                                <a key={fmt} href={downloads[fmt].replace('$HOST', DAMA_HOST)} className={t.verMenuItem}>
                                                                    <Icon icon="Download" className={t.verMenuIcon}/><span className={t.verMenuLabel}>{fmt}</span>
                                                                </a>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>
    )
}
