import {Link} from "react-router";
import React, {useContext, useEffect, useMemo, useState} from "react";
import {DatasetsContext} from "../context";
import {get} from "lodash-es";
import { getExternalEnv } from "../utils/datasources";
import { ThemeContext } from "../../../ui/useTheme";
import { externalVersionControlsTheme } from "./ExternalVersionControls.theme";

const isCalculatedCol = (attr={}) => {
    return attr.display === 'calculated' || attr.type === 'calculated' || attr.origin === 'calculated-column';
}

// legacy numeric SOURCE_AUTH_CONFIG removed — gating now via isUserAuthed string permissions

export const OUTPUT_FILE_TYPES = [
    "CSV",
    "ESRI Shapefile",
    "GeoJSON",
    "GPKG"
];
const INITIAL_MODAL_STATE = {
    open: false,
    loading: false,
    fileTypes: [],
    columns: [],
    enableGroupedBy: false,
    groupedByColumn: ""
}
const INITIAL_DELETE_MODAL_STATE = {
    open: false,
    loading: false,
}

const DownloadModalCheckbox = ({ inputName, checked, onChange, disabled=false }) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(theme?.datasets?.externalVersionControls || {}) };
    return (
        <div className={t.checkboxRow}>
            <input
                id={inputName}
                disabled={disabled}
                name={inputName}
                type="checkbox"
                className={t.checkboxInput}
                checked={checked}
                onChange={() => onChange(inputName)}
            />
            <label htmlFor={inputName} className={t.checkboxLabel}>
                {inputName}
            </label>
        </div>
    );
};

const DownloadModalGroupedBy = ({ children }) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(theme?.datasets?.externalVersionControls || {}) };
    return (
        <div className={t.groupedByWrapper}>
            <div className={t.groupedByTitle}>
                <div className={t.checkboxGroupTitleText}>Split data files</div>
            </div>
            <div className={t.groupedBySubTitle}>
                Split up data based on a specified column
            </div>
            {children}
        </div>
    );
};

const DownloadModalGroupColumnSelect = ({ options, modalState, onChange }) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(theme?.datasets?.externalVersionControls || {}) };
    return (
        <div className={t.groupColumnSelectRow}>
            <div className={t.groupColumnSelectLabel}>
                Output will have 1 file per distinct value in:
            </div>
            <select
                className={t.groupColumnSelect}
                value={modalState}
                onChange={(e) => onChange(e.target.value)}
            >
                {options.map((option, i) => (
                    <option key={i} className={t.selectOption} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </div>
    );
};

const DownloadModalGroupByToggle = ({ onChange, modalState }) => {
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(theme?.datasets?.externalVersionControls || {}) };
    return (
        <div className={t.groupByToggleWrapper}>
            <div className={t.groupByToggleRow}>
                <input
                    id={"enableGroupedBy"}
                    name={"enableGroupedBy"}
                    value={true}
                    type="radio"
                    className={t.groupByToggleInput}
                    checked={modalState}
                    onChange={() => onChange(true)}
                />
                <label
                    htmlFor={"enableGroupedBy"}
                    className={t.groupByToggleLabel}
                >
                    Yes
                </label>
                <input
                    id={"disableGroupedBy"}
                    name={"disableGroupedBy"}
                    value={true}
                    type="radio"
                    className={t.groupByToggleInputNo}
                    checked={!modalState}
                    onChange={() => onChange(false)}
                />
                <label
                    htmlFor={"enableGroupedBy"}
                    className={t.groupByToggleLabel}
                >
                    No
                </label>
            </div>
        </div>
    );
};

const DownloadModalCheckboxGroup = ({
                                        options,
                                        modalState,
                                        onChange,
                                        title,
                                    }) => {
    const {UI} = useContext(DatasetsContext);
    const {Button, Icon} = UI;
    const { theme: themeCtx } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(themeCtx?.datasets?.externalVersionControls || {}) };
    const hasCalcColumn = options.some(opt => isCalculatedCol(opt) ) && title === "Columns"
    return (
        <div className={t.checkboxGroupWrapper}>
            <div className={t.checkboxGroupTitleRow}>
                <div className={t.checkboxGroupTitleText}>{title}:</div>
                <div>
                    <Button
                        themeOptions={{ size: "sm" }}
                        onClick={() => {
                            if (modalState.length === options.length) {
                                onChange([]);
                            } else {
                                onChange(options.filter(opt => !opt?.name?.includes(" ")).map(opt => opt?.name || opt));
                            }
                        }}
                    >
                        Toggle All
                    </Button>
                </div>
            </div>
            <div className={t.checkboxGroupValidRow}>
                One or more must be selected
                {modalState.length > 0 ? (
                    <Icon icon={'CheckCircleIcon'} className={t.iconSuccess} />
                ) : (
                    <Icon icon={'XCircleIcon'} className={t.iconError} />
                )}
            </div>
            {hasCalcColumn ? <div className={t.calcColumnWarning}>(cannot include "Calculated Columns")</div>: ""}
            {options?.map((option) => (
                <DownloadModalCheckbox
                    key={`${option?.name || option}_checkbox`}
                    inputName={option?.name || option}
                    checked={modalState.includes(option?.name || option)}
                    onChange={onChange}
                    disabled={hasCalcColumn && option?.name?.includes(" ")}
                />
            ))}
        </div>
    );
};

export default function ExternalVersionControls({isDms, source, view, sourceId, viewId}) {
    const { datasources, baseUrl, user, isUserAuthed, falcor, falcorCache, UI, API_HOST } = useContext(DatasetsContext);
    const { theme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(theme?.datasets?.externalVersionControls || {}) };
    const pgEnv = getExternalEnv(datasources);
    // dms-server hosts the DAMA upload/download REST endpoints under
    // `/dama-admin/` on the main API host. No separate DAMA_HOST anymore.
    const apiBase = API_HOST;
    const {Button, Modal} = UI;

    const [modalState, setModalState] = useState(INITIAL_MODAL_STATE);
    const [deleteModalState, setDeleteModalState] = useState(INITIAL_DELETE_MODAL_STATE)

    const setFileTypes = (fileType) => {
        let newFileTypes;
        if(Array.isArray(fileType)){
            newFileTypes = fileType;
        }
        else if(modalState.fileTypes.includes(fileType)){
            newFileTypes = modalState.fileTypes.filter(ft => ft !== fileType)
        }
        else{
            newFileTypes = [...modalState.fileTypes]
            newFileTypes.push(fileType);
        }

        setModalState({...modalState, fileTypes: newFileTypes});
    }
    const setColumns = (columnName) => {
        let newColumns;
        if(Array.isArray(columnName)){
            newColumns = columnName;
        }
        else if(modalState.columns.includes(columnName)){
            newColumns = modalState.columns.filter(colName => colName !== columnName)
        }
        else{
            newColumns = [...modalState.columns];
            newColumns.push(columnName);
        }

        setModalState({...modalState, columns: newColumns})
    }
    const setModalOpen = (newModalOpenVal) => setModalState({...modalState, open: newModalOpenVal});
    const setEnableGroupedBy = (newEnableValue) => setModalState({...modalState, enableGroupedBy: newEnableValue});
    const setGroupedByColumn = (newGroupColumn) => setModalState({...modalState, groupedByColumn: newGroupColumn})
    const setDeleteModalOpen = (newModalOpenVal) => setDeleteModalState({...deleteModalState, open: newModalOpenVal})

    const sourceDataColumns = useMemo(() => {
        return (isDms ? JSON.parse(source.config)?.attributes : source.metadata?.columns) || [];
    }, [source]);

    //Only used after successful download creation
    const defaultModalState = useMemo(() => {
        if (sourceDataColumns) {
            return { ...INITIAL_MODAL_STATE, columns: sourceDataColumns };
        } else {
            return INITIAL_MODAL_STATE;
        }
    }, [sourceDataColumns]);

    //Initial modal state should have columns checked
    //Should only fire once, when we get the source metadata back from API
    useEffect(() => {
        if (sourceDataColumns) {
            //console.log('cols', sourceDataColumns)
            setModalState({ ...modalState, columns: sourceDataColumns.filter(col => isCalculatedCol(col)) });
        }
    }, [sourceDataColumns]);

    const deleteDownload = () => {
        const runDelete = async () => {
            try {
                const deleteData = {
                    source_id: sourceId,
                    view_id: viewId,
                    user_id: user.id,
                    email: user.email,
                };

                setDeleteModalState({...deleteModalState, loading: true});
                const res = await fetch(`${apiBase}/dama-admin/${pgEnv}/gis-dataset/delete-download`,
                    {
                        method: "DELETE",
                        body: JSON.stringify(deleteData),
                        headers: {
                            "Content-Type": "application/json",
                        },
                    });

                await res.json();
                // After delete, clear any cached view-by-id entries so the view's
                // metadata (which includes download config) re-fetches.
                await falcor.invalidate(["uda", pgEnv, "viewsById", viewId]);
                getData({ falcor, pgEnv, viewId });
                setDeleteModalState(INITIAL_DELETE_MODAL_STATE);
            } catch (err) {
                console.log(err)
                setDeleteModalState({...deleteModalState, loading: false, open: true});
            }
        }
        runDelete();
    }
    const openPmTilesModal = React.useCallback(e => {
        e.stopPropagation();
        setPmTilesModalState(prev =>
            ({ ...prev,
                open: true,
                etl_context_id: null,
                progress: "not-started"
            })
        );
    }, []);
    const createDownload = () => {
        const runCreate = async () => {
            try {
                const createData = {
                    source_id: sourceId,
                    view_id: viewId,
                    fileTypes: modalState.fileTypes,
                    columns: modalState.columns,
                    user_id: user.id,
                    email: user.email,
                    groupedByColumn: modalState.groupedByColumn
                };

                setModalState({...modalState, loading: true});
                const res = await fetch(`${apiBase}/dama-admin/${pgEnv}/gis-dataset/create-download`,
                    {
                        method: "POST",
                        body: JSON.stringify(createData),
                        headers: {
                            "Content-Type": "application/json",
                        },
                    });

                const createFinalEvent = await res.json();
                setModalState(defaultModalState);
            } catch (err) {
                console.log(err)
                setModalState({...modalState, loading: false, open: true});
            }
        }
        runCreate();
    }

    const [pmTilesModalState, setPmTilesModalState] = React.useState({
        open: false,
        selectedColumns: [],
        columnsHaveBeenInitialized: false,
        etl_context_id: null,
        progress: "not-started"
    });

    const closePmTilesModal = React.useCallback(() => {
        setPmTilesModalState(prev => ({ ...prev, open: false }));
    }, []);
    const setSelectedColumns = React.useCallback(columns => {
        if (Array.isArray(columns)) {
            setPmTilesModalState(prev => ({ ...prev, selectedColumns: columns }));
        }
        else {
            setPmTilesModalState(prev => ({
                ...prev,
                selectedColumns: prev.selectedColumns.includes(columns) ?
                    prev.selectedColumns.filter(col => col !== columns) :
                    [...prev.selectedColumns, columns]
            }))
        }
    }, []);

    React.useEffect(() => {
        if (sourceDataColumns.length && !pmTilesModalState.columnsHaveBeenInitialized) {
            setPmTilesModalState(prev => ({
                ...prev,
                selectedColumns: [...sourceDataColumns],
                columnsHaveBeenInitialized: true
            }));
        }
    }, [pmTilesModalState.columnsHaveBeenInitialized, sourceDataColumns]);

    const cachePmTiles = React.useCallback(() => {
        // PMTiles is now mounted under the plugin path on dms-server
        // (see `src/dama/datatypes/index.js` which mounts datatype routers
        // under `/dama-admin/:pgEnv/${name}`). The old URL at
        // `/dama-admin/:pgEnv/cache-pmtiles` doesn't exist anymore.
        fetch(
            `${ apiBase }/dama-admin/${ pgEnv }/pmtiles/cache-pmtiles`,
            { method: "POST",
                body: JSON.stringify({
                    columns: [...pmTilesModalState.selectedColumns],
                    view_id: viewId,
                    source_id: sourceId
                }),
                headers: {
                    "Content-Type": "application/json",
                }
            }
        ).then(res => res.json())
            .then(json => {
                //console.log("RES:", json);
                setPmTilesModalState(prev => ({ ...prev,
                        etl_context_id: json.etl_context_id,
                        progress: "started"
                    })
                );
            })
    }, [pmTilesModalState, sourceId, viewId, pgEnv, falcor]);

    const updateProgress = React.useCallback(progress => {
        setPmTilesModalState(prev => ({ ...prev, progress }));
    }, []);

    const doesViewHaveDownload = view?.metadata?.value?.download && Object.keys(view?.metadata?.value?.download).length > 0;
    //console.log('do i get here?', user, sourceDataColumns)
    return (
        <div className={t.wrapper}>
            {isUserAuthed(['manage-downloads']) ? (
                <div className={t.adminControls}>
                    <Button
                        className={t.createDownloadBtn}
                        onClick={() => {
                            setModalState({...modalState, open: true});
                        }}
                    >
                        <i className={'fa fa-download'}/> Create Download
                    </Button>
                    {doesViewHaveDownload && <Button
                        className={t.deleteDownloadBtn}
                        onClick={() => {
                            setDeleteModalState({...deleteModalState, open: true});
                        }}
                    >
                        <i className={t.trashIcon}/> Delete Download
                    </Button>}
                    <Button
                        className={t.cachePmTilesBtn}
                        onClick={ openPmTilesModal }
                    >
                        <i className={'fa fa-download'}/> Cache PM Tiles
                    </Button>
                    <Link
                        className={t.deleteViewLink}
                        to={`${baseUrl}/source/${sourceId}/versions/${viewId}/delete`}
                    >
                        <i className={t.trashIcon}/> Delete View
                    </Link>
                </div>
            ) : (
                ""
            )}

            { /*CREATE PMTILES MODAL*/ }
            <PmTilesModal { ...pmTilesModalState }
                          close={ closePmTilesModal }
                          columns={ sourceDataColumns.filter(col => col !== "wkb_geometry") }
                          setSelectedColumns={ setSelectedColumns }
                          cachePmTiles={ cachePmTiles }
                          updateProgress={ updateProgress }/>

            { /*CREATE DOWNLOAD MODAL*/ }
            <Modal
                open={modalState.open}
                setOpen={setModalOpen}
                themeOptions={{size:"large"}}
            >
                <div className={t.createModalHeader}>
                    <div className={t.createModalIconWrapper}>
                        <i
                            className={t.layerGroupIcon}
                            aria-hidden="true"
                        />
                    </div>
                    <div className={t.createModalTitleWrapper}>
                        <div className={t.createModalTitle}>
                            Create Data Download
                        </div>
                    </div>
                </div>
                <div className={t.createModalBody}>
                    <DownloadModalCheckboxGroup
                        title={"File Types"}
                        options={OUTPUT_FILE_TYPES}
                        modalState={modalState.fileTypes}
                        onChange={setFileTypes}
                    />
                    <DownloadModalCheckboxGroup
                        title={"Columns"}
                        options={sourceDataColumns}
                        modalState={modalState.columns}
                        onChange={setColumns}
                    />
                    <DownloadModalGroupedBy>
                        <DownloadModalGroupByToggle
                            onChange={setEnableGroupedBy}
                            modalState={modalState.enableGroupedBy}
                        />
                        {modalState.enableGroupedBy && (
                            <DownloadModalGroupColumnSelect
                                options={modalState.columns}
                                modalState={modalState.groupedByColumn}
                                onChange={setGroupedByColumn}
                            />
                        )}
                    </DownloadModalGroupedBy>
                </div>
                <div className={t.createModalFooter}>
                    <Button
                        type="button"
                        disabled={
                            modalState.loading ||
                            modalState.fileTypes.length === 0 ||
                            modalState.columns.length === 0 ||
                            modalState.columns.some(colName => isCalculatedCol(sourceDataColumns.find(c => c.name === colName)))
                        }
                        className={t.createModalConfirmBtn}
                        onClick={createDownload}
                    >
                        {modalState.loading
                            ? "Sending request..."
                            : "Start download creation"}
                    </Button>
                    <Button
                        type="button"
                        className={t.createModalCancelBtn}
                        onClick={() => setModalOpen(false)}
                    >
                        Cancel
                    </Button>
                </div>
            </Modal>

            { /*DELETE DOWNLOAD MODAL*/ }
            <Modal
                open={deleteModalState.open}
                setOpen={setDeleteModalOpen}
            >
                <div className={t.deleteModalHeader}>
                    <div className={t.deleteModalIconWrapper}>
                        <i
                            className={t.layerGroupIcon}
                            aria-hidden="true"
                        />
                    </div>
                    <div className={t.deleteModalTitleWrapper}>
                        <div className={t.deleteModalTitle}>
                            Delete Data Download
                        </div>
                    </div>
                </div>
                <div></div>
                <div className={t.deleteModalMessage}>
                    Are you sure you want to delete the downloadable file for this view? The underlying source and view will NOT be affected.
                </div>
                <div className={t.deleteModalFooter}>
                    <Button
                        type="button"
                        disabled={
                            deleteModalState.loading
                        }
                        className={t.deleteModalConfirmBtn}
                        onClick={deleteDownload}
                    >
                        {deleteModalState.loading
                            ? "Sending request..."
                            : "Delete Download"}
                    </Button>
                    <Button
                        type="button"
                        className={t.deleteModalCancelBtn}
                        onClick={() => setDeleteModalOpen(false)}
                    >
                        Cancel
                    </Button>
                </div>
            </Modal>
        </div>
    );
}

const PmTilesModal = props => {
    const {
        close,
        columns,
        selectedColumns,
        setSelectedColumns,
        cachePmTiles,
        etl_context_id,
        progress,
        updateProgress,
        ...modalState
    } = props;
    const {UI} = useContext(DatasetsContext);
    const { theme: pmTheme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(pmTheme?.datasets?.externalVersionControls || {}) };
    const {Modal} = UI;
    return (
        <Modal { ...modalState }>
            <div className={t.pmTilesModalWrapper}>

                <div className={t.pmTilesModalContent}>
                    <div className={t.pmTilesModalGrid}>
                        <DownloadModalCheckboxGroup
                            title={ "Columns" }
                            options={ columns }
                            modalState={ selectedColumns }
                            onChange={ setSelectedColumns }/>
                        <div className={t.colSpan2}>
                            { !etl_context_id ? null :
                                <PmTilesProgressWindow
                                    etl_context_id={ etl_context_id }
                                    updateProgress={ updateProgress }/>
                            }
                        </div>
                    </div>
                </div>

                <div className={t.pmTilesModalFooter}>
                    <div className={t.pmTilesModalCloseCol}>
                        <SlatePmTilesModalButton
                            onClick={ close }
                            disabled={ progress === "started" }
                        >
                            Close
                        </SlatePmTilesModalButton>
                    </div>

                    <div className={t.pmTilesModalCacheCol}>
                        <GreenPmTilesModalButton
                            onClick={ cachePmTiles }
                            disabled={ !selectedColumns.length || (progress !== "not-started") }
                            color="green"
                        >
                            Cache PM Tiles
                        </GreenPmTilesModalButton>
                    </div>
                </div>

            </div>
        </Modal>
    )
}

const PmTilesProgressWindow = ({ etl_context_id }) => {

    const { datasources, falcor, falcorCache, updateProgress } = useContext(DatasetsContext);
    const { theme: pwTheme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(pwTheme?.datasets?.externalVersionControls || {}) };
    const pgEnv = getExternalEnv(datasources);

    const [now, setNow] = React.useState(0);
    const [events, setEvents] = React.useState([]);

    const getEvents = React.useCallback(() => {
        if (!etl_context_id) return;
        // Legacy DAMA server exposed task status via `etlContexts.byEtlContextId`.
        // dms-server's UDA task routes expose the same info at
        // `uda[pgEnv].tasks.byId[task_id]` (task_id == the legacy etl_context_id
        // for pmtiles jobs, since tasks were migrated in-place preserving ids).
        falcor.invalidate(["uda", pgEnv, "tasks", "byId", etl_context_id]);
        falcor.get(["uda", pgEnv, "tasks", "byId", etl_context_id])
            .then(() => { setNow(Date.now()); });
    }, [falcor, pgEnv, etl_context_id]);

    const timeoutId = React.useRef(null);

    const timeDelayedGetEvents = React.useCallback((delay = 5000) => {
        new Promise(resolve => {
            clearTimeout(timeoutId.current);
            timeoutId.current = setTimeout(resolve, delay);
        }).then(() => { getEvents(); })
    }, [getEvents]);

    React.useEffect(() => {
        if (!events.length) {
            timeDelayedGetEvents(1000);
        }
        else {
            const firstEvent = events[0];
            const [firstType, firstState] = firstEvent.type.split(":");

            const lastEvent = events[events.length - 1];
            const [lastType, lastState] = lastEvent.type.split(":");

            if ((firstType === lastType) && ((lastState !== "ERROR") || (lastState !== "FINAL"))) {
                timeDelayedGetEvents();
            }
            else {
                updateProgress("completed");
            }
        }
    }, [events, getEvents, timeDelayedGetEvents, now, updateProgress]);

    React.useEffect(() => {
        if (!etl_context_id) {
            setEvents([]);
        }
        else {
            // UDA task rows carry their events at `tasks.byId[id].events` —
            // matches legacy shape after the task-port migration.
            const events = get(falcorCache,
                ["uda", pgEnv, "tasks", "byId", etl_context_id, "value", "events"],
                []
            );
            setEvents(events);
        }
    }, [falcorCache, pgEnv, etl_context_id]);

    return (
        <div className={t.progressWindowWrapper}
             style={ { fontSize: "0.8rem" } }
        >
            <div className={t.progressWindowHeader}>
                <div className={t.progressWindowTitle}>Progress Window</div>
                <div>etl context id: { etl_context_id }</div>
            </div>
            { events.map(e => (
                <EventItem key={ e.event_id } damaEvent={ e }/>
            ))
            }
        </div>
    )
}

const EventItem = ({ damaEvent }) => {
    const { theme: evTheme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(evTheme?.datasets?.externalVersionControls || {}) };
    const data = React.useMemo(() => {
        return get(damaEvent, ["payload", "data"], null);
    }, [damaEvent]);

    return (
        <div className={t.eventItemWrapper}>
            { damaEvent.type }{ data ? "==>" : "" } { data }
        </div>
    )
}

const PmTilesModalButton = ({ className = "", onClick, disabled = false, children }) => {
    const {UI} = useContext(DatasetsContext);
    const { theme: btnTheme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(btnTheme?.datasets?.externalVersionControls || {}) };
    const {Button} = UI;

    const doOnClick = React.useCallback(e => {
        e.stopPropagation();
        (typeof onClick === "function") && onClick();
    }, [onClick]);
    return (
        <Button disabled={ disabled }
                onClick={ doOnClick }
                className={ `${ t.pmTilesModalBtnBase } ${ className }` }
        >
            { children }
        </Button>
    )
}

const GreenPmTilesModalButton = props => {
    const { theme: gTheme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(gTheme?.datasets?.externalVersionControls || {}) };
    return (
        <PmTilesModalButton { ...props }
                            className={t.pmTilesModalBtnGreen}/>
    )
}
const SlatePmTilesModalButton = props => {
    const { theme: sTheme } = useContext(ThemeContext) || {};
    const t = { ...externalVersionControlsTheme, ...(sTheme?.datasets?.externalVersionControls || {}) };
    return (
        <PmTilesModalButton { ...props }
                            className={t.pmTilesModalBtnSlate}/>
    )
}
