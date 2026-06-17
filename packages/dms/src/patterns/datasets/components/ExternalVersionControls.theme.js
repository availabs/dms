export const externalVersionControlsTheme = {
    // Main wrapper
    wrapper: 'w-72 px-5',
    adminControls: 'w-full flex flex-col p-1',
    linkClass: 'w-full flex-1 text-center border shadow p-2 font-medium rounded-md hover:text-white',
    createDownloadBtn: 'w-full flex-1 text-center border shadow p-2 font-medium rounded-md hover:text-white bg-blue-300 hover:bg-blue-600 mb-1',
    deleteDownloadBtn: 'w-full flex-1 text-center border shadow p-2 font-medium rounded-md hover:text-white bg-red-300 border-red-200 hover:bg-red-600 mb-1',
    cachePmTilesBtn: 'w-full flex-1 text-center border shadow p-2 font-medium rounded-md hover:text-white bg-green-300 hover:bg-green-600 mb-1',
    deleteViewLink: 'w-full flex-1 text-center border shadow p-2 font-medium rounded-md hover:text-white bg-red-300 border-red-200 hover:bg-red-600',

    // DownloadModalCheckbox
    checkboxRow: 'mt-2 flex items-center',
    checkboxInput: 'h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded',
    checkboxLabel: 'ml-2 text-sm text-gray-900',

    // DownloadModalGroupedBy
    groupedByWrapper: 'mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left',
    groupedByTitle: 'flex justify-between items-center w-1/2 text-md leading-6 text-gray-900',
    groupedBySubTitle: 'flex mt-2 text-sm items-center',

    // DownloadModalGroupColumnSelect
    groupColumnSelectRow: 'mt-2 flex items-center',
    groupColumnSelectLabel: 'flex mt-2 text-sm items-center',
    groupColumnSelect: 'w-full bg-blue-100 rounded mr-2 px-1 flex text-sm',

    // DownloadModalGroupByToggle
    groupByToggleWrapper: 'mt-3 text-center sm:mt-0 sm:text-left',
    groupByToggleRow: 'mt-2 flex items-center',
    groupByToggleInput: 'h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded',
    groupByToggleLabel: 'ml-2 text-sm text-gray-900',
    groupByToggleInputNo: 'h-4 w-4 ml-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded',

    // DownloadModalCheckboxGroup
    checkboxGroupWrapper: 'mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left max-h-[700px] overflow-y-auto',
    checkboxGroupTitleRow: 'flex w-full justify-between items-center w-1/2 text-md leading-6 text-gray-900',
    checkboxGroupTitleText: 'text-center h-fit',
    checkboxGroupValidRow: 'flex mt-2 text-sm items-center',

    // Create Download Modal
    createModalHeader: 'flex items-center m-1',
    createModalIconWrapper: 'mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10',
    createModalTitleWrapper: 'mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full',
    createModalTitle: 'text-lg align-center font-semibold leading-6 text-gray-900',
    createModalBody: 'pl-10 grid grid-cols-3',
    createModalFooter: 'mt-5 sm:mt-4 sm:flex sm:flex-row-reverse',
    createModalConfirmBtn: 'disabled:bg-slate-300 disabled:cursor-warning inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 sm:ml-3 sm:w-auto m-1',
    createModalCancelBtn: 'mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 sm:w-auto m-1',

    // Delete Download Modal
    deleteModalHeader: 'flex items-center m-1',
    deleteModalIconWrapper: 'mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 sm:mx-0 sm:h-10 sm:w-10',
    deleteModalTitleWrapper: 'mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left w-full',
    deleteModalTitle: 'text-lg align-center font-semibold leading-6 text-gray-900',
    deleteModalMessage: 'flex m-2',
    deleteModalFooter: 'mt-5 sm:mt-4 sm:flex sm:flex-row-reverse',
    deleteModalConfirmBtn: 'disabled:bg-slate-300 disabled:cursor-warning inline-flex w-full justify-center rounded-md  px-3 py-2 text-sm font-semibold text-white shadow-sm bg-red-300 border-red-200 hover:bg-red-600 mb-1 sm:ml-3 sm:w-auto mr-1',
    deleteModalCancelBtn: 'mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:mt-0 mb-1 sm:w-auto',

    // PmTilesModal
    pmTilesModalWrapper: 'p-2',
    pmTilesModalContent: 'pb-2 border-b-2 border-black',
    pmTilesModalGrid: 'grid grid-cols-3 gap-2',
    pmTilesModalFooter: 'pt-2 grid grid-cols-12 gap-2',
    pmTilesModalCloseCol: 'col-start-7 col-span-3',
    pmTilesModalCacheCol: 'col-span-3',

    // PmTilesProgressWindow
    progressWindowWrapper: 'py-1 px-2 grid grid-cols-1',
    progressWindowHeader: 'border-b-2 border-current flex',
    progressWindowTitle: 'font-medium text-sm flex-1',
    eventItemWrapper: 'flex',

    // Misc
    selectOption: 'ml-2 truncate',
    iconSuccess: 'ml-2 text-green-700 h-4 w-4',
    iconError: 'ml-2 text-red-700 h-4 w-4',
    calcColumnWarning: 'flex mt-1 text-xs items-center',
    trashIcon: 'fad fa-trash',
    layerGroupIcon: 'fad fa-layer-group text-blue-600',
    colSpan2: 'col-span-2',

    // PmTilesModalButton
    pmTilesModalBtnBase: 'w-full py-2 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm text-black hover:text-white hover:disabled:text-black',
    pmTilesModalBtnGreen: 'bg-green-300 hover:bg-green-600 hover:disabled:bg-green-300',
    pmTilesModalBtnSlate: 'bg-slate-300 hover:bg-slate-600 hover:disabled:bg-slate-300',
}
