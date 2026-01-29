import {Link} from "react-router";
import React, {useContext, useEffect, useMemo, useState} from "react";
import {DatasetsContext} from "../context";
import {get} from "lodash-es";
import { getExternalEnv } from "../utils/datasources";

const isCalculatedCol = (attr={}) => {
    return attr.display === 'calculated' || attr.type === 'calculated' || attr.origin === 'calculated-column';
}

const SOURCE_AUTH_CONFIG = {
    "VIEW": 1,
    "DOWNLOAD": 2,
    "EDIT": 3,
    "ADMIN" : 5,
    "SUPER": 10
};

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
    return (
        <div className="mt-2 flex items-center">
            <input
                id={inputName}
                disabled={disabled}
                name={inputName}
                type="checkbox"
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                checked={checked}
                onChange={() => onChange(inputName)}
            />
            <label htmlFor={inputName} className="ml-2 text-sm text-gray-900">
                {inputName}
            </label>
        </div>
    );
};

const DownloadModalGroupedBy = ({ children }) => {
    return (
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
            <div className="flex justify-between items-center w-1/2 text-md leading-6 text-gray-900">
                <div className="text-center h-fit">Split data files</div>
            </div>
            <div className="flex mt-2 text-sm items-center">
                Split up data based on a specified column
            </div>
            {children}
        </div>
    );
};

const DownloadModalGroupColumnSelect = ({ options, modalState, onChange }) => {
    return (
        <div className="mt-2 flex items-center">
            <div className="flex mt-2 text-sm items-center">
                Output will have 1 file per distinct value in:
            </div>
            <select
                className="w-full bg-blue-100 rounded mr-2 px-1 flex text-sm"
                value={modalState}
                onChange={(e) => onChange(e.target.value)}
            >
                {options.map((option, i) => (
                    <option key={i} className="ml-2 truncate " value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </div>
    );
};

const DownloadModalGroupByToggle = ({ onChange, modalState }) => {
    return (
        <div className="mt-3 text-center sm:mt-0 sm:text-left">
            <div className="mt-2 flex items-center">
                <input
                    id={"enableGroupedBy"}
                    name={"enableGroupedBy"}
                    value={true}
                    type="radio"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    checked={modalState}
                    onChange={() => onChange(true)}
                />
                <label
                    htmlFor={"enableGroupedBy"}
                    className="ml-2 text-sm text-gray-900"
                >
                    Yes
                </label>
                <input
                    id={"disableGroupedBy"}
                    name={"disableGroupedBy"}
                    value={true}
                    type="radio"
                    className="h-4 w-4 ml-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    checked={!modalState}
                    onChange={() => onChange(false)}
                />
                <label
                    htmlFor={"enableGroupedBy"}
                    className="ml-2 text-sm text-gray-900"
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
    const hasCalcColumn = options.some(opt => isCalculatedCol(opt) ) && title === "Columns"
    return (
        <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left max-h-[700px] overflow-y-auto">
            <div className="flex w-full justify-between items-center w-1/2 text-md leading-6 text-gray-900">
                <div className="text-center h-fit">{title}:</div>
                <div>
                    <Button
                        themeOptions={{ size: "sm" }}
                        onClick={() => {
                            if (modalState.length === options.length) {
                                onChange([]);
                            } else {
                                onChange([...options]);
                            }
                        }}
                    >
                        Toggle All
                    </Button>
                </div>
            </div>
            <div className="flex mt-2 text-sm items-center">
                One or more must be selected
                {modalState.length > 0 ? (
                    <Icon icon={'CheckCircleIcon'} className="ml-2 text-green-700 h-4 w-4" />
                ) : (
                    <Icon icon={'XCircleIcon'} className="ml-2 text-red-700 h-4 w-4" />
                )}
            </div>
            {hasCalcColumn ? <div className="flex mt-1 text-xs items-center">(cannot include "Calculated Columns")</div>: ""}
            {options?.map((option) => (
                <DownloadModalCheckbox
                    key={`${option?.name || option}_checkbox`}
                    inputName={option?.name || option}
                    checked={modalState.includes(option?.name || option)}
                    onChange={onChange}
                    disabled={hasCalcColumn && option?.includes(" ")}
                />
            ))}
        </div>
    );
};

export default function ExternalVersionControls({isDms, source, view, sourceId, viewId}) {
    const { datasources, baseUrl, user, falcor, falcorCache, UI, DAMA_HOST } = useContext(DatasetsContext);
    const pgEnv = getExternalEnv(datasources);
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
            console.log('cols', sourceDataColumns)
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
                const res = await fetch(`${DAMA_HOST}/dama-admin/${pgEnv}/gis-dataset/delete-download`,
                    {
                        method: "DELETE",
                        body: JSON.stringify(deleteData),
                        headers: {
                            "Content-Type": "application/json",
                        },
                    });

                await res.json();
                await falcor.invalidate(["dama", pgEnv, "viewDependencySubgraphs", "byViewId", viewId]);
                await falcor.invalidate(["dama", pgEnv, "views", "byId", viewId]);
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
                const res = await fetch(`${DAMA_HOST}/dama-admin/${pgEnv}/gis-dataset/create-download`,
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
        fetch(
            `${ DAMA_HOST }/dama-admin/${ pgEnv }/cache-pmtiles`,
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
                console.log("RES:", json);
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

    const linkClass = 'w-full flex-1 text-center border shadow p-2 font-medium rounded-md hover:text-white'
    const doesViewHaveDownload = view?.metadata?.value?.download && Object.keys(view?.metadata?.value?.download).length > 0;
    console.log('do i get here?', user, sourceDataColumns)
    return (
        <div className="w-72 px-5">
            {user.authLevel >= SOURCE_AUTH_CONFIG['SUPER'] ? (
                <div className="w-full flex flex-col p-1">
                    <Button
                        className={`${linkClass} bg-blue-300 hover:bg-blue-600 mb-1`}
                        onClick={() => {
                            setModalState({...modalState, open: true});
                        }}
                    >
                        <i className={'fa fa-download'}/> Create Download
                    </Button>
                    {doesViewHaveDownload && <Button
                        className={`${linkClass}  bg-red-300 border-red-200 hover:bg-red-600 mb-1`}
                        onClick={() => {
                            setDeleteModalState({...deleteModalState, open: true});
                        }}
                    >
                        <i className="fad fa-trash"/> Delete Download
                    </Button>}
                    <Button
                        className={`${linkClass} bg-green-300 hover:bg-green-600 mb-1`}
                        onClick={ openPmTilesModal }
                    >
                        <i className={'fa fa-download'}/> Cache PM Tiles
                    </Button>
                    <Link
                        className={`${linkClass} bg-red-300 border-red-200 hover:bg-red-600`}
                        to={`${baseUrl}/source/${sourceId}/versions/${viewId}/delete`}
                    >
                        <i className="fad fa-trash"/> Delete View
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
                <div className="flex items-center m-1">
                    <div
                        className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                        <i
                            className="fad fa-layer-group text-blue-600"
                            aria-hidden="true"
                        />
                    </div>
                    <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                        <div className="text-lg align-center font-semibold leading-6 text-gray-900">
                            Create Data Download
                        </div>
                    </div>
                </div>
                <div className={"pl-10 grid grid-cols-3"}>
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
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                    <Button
                        type="button"
                        disabled={
                            modalState.loading ||
                            modalState.fileTypes.length === 0 ||
                            modalState.columns.length === 0 ||
                            modalState.columns.some(colName => isCalculatedCol(sourceDataColumns.find(c => c.name === colName)))
                        }
                        className="disabled:bg-slate-300 disabled:cursor-warning inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto m-1"
                        onClick={createDownload}
                    >
                        {modalState.loading
                            ? "Sending request..."
                            : "Start download creation"}
                    </Button>
                    <Button
                        type="button"
                        className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto m-1"
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
                <div className="flex items-center m-1">
                    <div
                        className="mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10">
                        <i
                            className="fad fa-layer-group text-blue-600"
                            aria-hidden="true"
                        />
                    </div>
                    <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full">
                        <div className="text-lg align-center font-semibold leading-6 text-gray-900">
                            Delete Data Download
                        </div>
                    </div>
                </div>
                <div></div>
                <div className={"flex m-2"}>
                    Are you sure you want to delete the downloadable file for this view? The underlying source and view will NOT be affected.
                </div>
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                    <Button
                        type="button"
                        disabled={
                            deleteModalState.loading
                        }
                        className="disabled:bg-slate-300 disabled:cursor-warning inline-flex w-full justify-center rounded-md  px-3 py-2 text-sm font-semibold text-white shadow-sm bg-red-300 border-red-200 hover:bg-red-600 mb-1 sm:ml-3 sm:w-auto mr-1"
                        onClick={deleteDownload}
                    >
                        {deleteModalState.loading
                            ? "Sending request..."
                            : "Delete Download"}
                    </Button>
                    <Button
                        type="button"
                        className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 mb-1 sm:w-auto"
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
    const {Modal} = UI;
    return (
        <Modal { ...modalState }>
            <div className="p-2">

                <div className={ `
            pb-2 border-b-2 border-black
          ` }
                >
                    <div className="grid grid-cols-3 gap-2">
                        <DownloadModalCheckboxGroup
                            title={ "Columns" }
                            options={ columns }
                            modalState={ selectedColumns }
                            onChange={ setSelectedColumns }/>
                        <div className="col-span-2">
                            { !etl_context_id ? null :
                                <PmTilesProgressWindow
                                    etl_context_id={ etl_context_id }
                                    updateProgress={ updateProgress }/>
                            }
                        </div>
                    </div>
                </div>

                <div className="pt-2 grid grid-cols-12 gap-2">
                    <div className="col-start-7 col-span-3">
                        <SlatePmTilesModalButton
                            onClick={ close }
                            disabled={ progress === "started" }
                        >
                            Close
                        </SlatePmTilesModalButton>
                    </div>

                    <div className="col-span-3">
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
    const pgEnv = getExternalEnv(datasources);

    const [now, setNow] = React.useState(0);
    const [events, setEvents] = React.useState([]);

    const getEvents = React.useCallback(() => {
        if (!etl_context_id) return;
        falcor.invalidate(["dama", pgEnv, "etlContexts", "byEtlContextId", etl_context_id]);
        falcor.get(["dama", pgEnv, "etlContexts", "byEtlContextId", etl_context_id])
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
            const events = get(falcorCache,
                ["dama", pgEnv, "etlContexts", "byEtlContextId",
                    etl_context_id, "value", "events"
                ], []
            );
            setEvents(events);
        }
    }, [falcorCache, pgEnv, etl_context_id]);

    return (
        <div className="py-1 px-2 grid grid-cols-1"
             style={ { fontSize: "0.8rem" } }
        >
            <div className="border-b-2 border-current flex">
                <div className="font-medium text-sm flex-1">Progress Window</div>
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
    const data = React.useMemo(() => {
        return get(damaEvent, ["payload", "data"], null);
    }, [damaEvent]);

    return (
        <div className="flex">
            { damaEvent.type }{ data ? "==>" : "" } { data }
        </div>
    )
}

const PmTilesModalButton = ({ className = "", onClick, disabled = false, children }) => {
    const {UI} = useContext(DatasetsContext);
    const {Button} = UI;

    const doOnClick = React.useCallback(e => {
        e.stopPropagation();
        (typeof onClick === "function") && onClick();
    }, [onClick]);
    return (
        <Button disabled={ disabled }
                onClick={ doOnClick }
                className={ `
        w-full py-2 rounded cursor-pointer
        disabled:opacity-50 disabled:cursor-not-allowed
        text-sm text-black hover:text-white hover:disabled:text-black
        ${ className }
      ` }
        >
            { children }
        </Button>
    )
}

const GreenPmTilesModalButton = props => {
    return (
        <PmTilesModalButton { ...props }
                            className="bg-green-300 hover:bg-green-600 hover:disabled:bg-green-300"/>
    )
}
const SlatePmTilesModalButton = props => {
    return (
        <PmTilesModalButton { ...props }
                            className="bg-slate-300 hover:bg-slate-600 hover:disabled:bg-slate-300"/>
    )
}
