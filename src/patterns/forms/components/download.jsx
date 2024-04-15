import {useRef, useState, Fragment, useEffect} from "react";
import { Dialog, Transition } from '@headlessui/react'
// import Multiselect from "~/modules/dms/src/data-types/multiselect.jsx";
import MultiSelect from "~/component_registry/shared/MultiSelect.jsx";
import {getColAccessor} from "../utils/getColAccesor";
import { CSVLink } from "react-csv";
import {getData} from "../utils/getData.js";
import {ButtonSelector} from "~/component_registry/shared/buttonSelector.jsx";
import {falcor} from "~/modules/avl-falcor"

export const DownloadModal = ({
                                  columns, visibleCols, form, data, filteredData, displayDownload, setDisplayDownload,

                                  formsConfig,
                                  actionType,
                                  pgEnv,
                                  geoid,
                                  geoAttribute,
                                  pageSize, sortBy, groupBy, fn, notNull, colSizes,
                                  filters, filterValue, manualFilters, hiddenCols,
                                  metaLookupByViewId, setMetaLookupByViewId,
                                  getNestedValue
}) => {
    const [loading, setLoading] = useState(false)
    const [finalCols, setFinalCols] = useState(columns.filter(c => visibleCols.includes(c.name)).map(c => ({key: c.name, label: c.display_name})));
    const [finalData, setFinalData] = useState([['data', 'did not', 'change']])
    const cancelButtonRef = useRef(null)
    const [filterData, setFilterData] = useState('Filtered')
    const [downloaded, setDownloaded] = useState(false);
    // const [metaLookupByViewId, setMetaLookupByViewId] = useState({});
    const csvLink = useRef();

    const columnsToDownload = finalCols.map(fc => columns.find(c => c.name === fc.key)).filter(fc => fc).map(fc => getColAccessor({}, fc?.name, fc.origin, form));
    const columnsToDownloadHeaders = finalCols.map(fc => columns.find(c => c.name === fc.key)).filter(fc => fc).map(fc => fc.display_name);
    // const dataToDownload = data.map(d => columnsToDownload.map(col => d[col]?.replace(`"`, '')?.replace(',', ' ')));
    const getUpdatedData = async () => {
        setLoading(true)
        // fetch data and allow download
        const data = await getData({
            formsConfig,
            actionType, form,
            metaLookupByViewId,
            setMetaLookupByViewId,
            visibleCols: finalCols.map(fc => fc.key),
            pgEnv,
            geoid,
            geoAttribute,
            pageSize, sortBy, groupBy, fn, notNull, colSizes,
            filters, filterValue, hiddenCols,
            // setData: setFinalData
        }, falcor)

        const finalData = data
            .filter(row => {
                return filterData === 'Full' || !Object.keys(manualFilters)?.length ||
                    Object.keys(manualFilters).reduce((acc, filterCol) => acc && manualFilters[filterCol]?.includes(row[filterCol]), true)
            })
            .map(d => columnsToDownload.map(col =>  {
                let value = getNestedValue(d[col]);
                return Array.isArray(value) ? value.join(', ') : typeof value === 'object' ? '' : value
                })
            );
        setDownloaded(false)
        setFinalData([columnsToDownloadHeaders, ...finalData]);
        console.log('getting data?',filterData, manualFilters, data, columnsToDownload, finalData, metaLookupByViewId)

        // csvLink.current.setAttribute('data', [columnsToDownloadHeaders, ...finalData]);
        setLoading(false);

    }

    useEffect(() => {
        if(!downloaded){
            csvLink?.current?.link.click();
        }
        setDownloaded(true)
    }, [finalData]);

    // pick oclumns
    // check if you need to fetch more data by comparing existing columns and picked columns
    // fetch data if needed and download

    console.log('final data', finalData)
    return (
        <Transition.Root show={displayDownload} as={Fragment}>
            <Dialog as="div" className="relative z-10" initialFocus={cancelButtonRef} onClose={setDisplayDownload}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
                    <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                <div>
                                    <div className="mt-3 text-center sm:mt-5">
                                        <Dialog.Title as="h3" className="text-base font-semibold leading-6 text-gray-900">
                                            Download
                                        </Dialog.Title>
                                    </div>
                                    <div className="mt-2 z-20">
                                        <MultiSelect
                                            showAll={true}
                                            className={'flex-row-reverse'}
                                            options={columns.map(c => ({key: c.name, label: c.display_name}))}
                                            value={visibleCols}
                                            label={'Columns'}
                                            onChange={e => setFinalCols(e)}
                                        />
                                    </div>
                                </div>
                                <ButtonSelector
                                    label={'Data:'}
                                    types={['Filtered', 'Full']}
                                    type={filterData}
                                    setType={setFilterData}
                                />
                                <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                                    <button
                                        type="button"
                                        className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2"
                                        onClick={getUpdatedData}
                                    >
                                        {loading ? 'Loading...' : 'Download'}
                                    </button>

                                    <CSVLink
                                        ref={csvLink}
                                        type="button"
                                        className={'hidden'}
                                        filename={`${form}-data.csv`}
                                        data={finalData} // change
                                        // separator={"|"}
                                    />
                                    <button
                                        type="button"
                                        className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
                                        onClick={() => setDisplayDownload(false)}
                                        ref={cancelButtonRef}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition.Root>
    )
}

