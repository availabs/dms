export const createPageTheme = {
    // CreatePage
    wrapper: 'grid grid-cols-1 gap-2 relative',
    topRow: 'flex',
    fileInputHidden: 'hidden',
    selectFileBtn: 'bg-gray-200 hover:bg-gray-300 hover:cursor-pointer hover:disabled:bg-gray-200 disabled:opacity-50 hover:disabled:cursor-not-allowed w-60 py-2 rounded cursor-pointer',
    noNameHint: 'flex-1 flex justify-end items-center',

    // File (uploading overlay)
    uploadingOverlay: 'bg-black/75 absolute inset-0 rounded text-white text-5xl font-extrabold z-50 flex items-center justify-center',
    errorOverlay: 'bg-black/85 absolute inset-0 rounded text-white text-2xl font-extrabold z-50 flex flex-col items-center justify-center',
    errorCloseBtn: 'bg-green-200 hover:bg-green-300 hover:disabled:bg-green-200 mt-2 disabled:opacity-50 hover:disabled:cursor-not-allowed w-60 py-2 rounded cursor-pointer text-black absolute bottom-2 right-2 text-base font-normal',

    // File info
    fileInfoTitle: 'text-xl font-extrabold border-b-3 flex',
    fileInfoGrid: 'grid grid-cols-5',
    fileInfoLabel: 'col-span-2 font-bold pl-6',
    fileInfoValue: 'col-span-3',
    divider: 'border-b-3',

    // Directory path
    dirPathRow: 'grid grid-cols-5 my-1',
    dirPathLabel: 'text-xl font-extrabold col-span-2 whitespace-nowrap',
    dirPathInput: 'px-2 py-1 bg-white border rounded block w-full col-span-3',

    // Description
    descRow: 'grid grid-cols-5 mt-1',
    descLabel: 'text-xl font-extrabold col-span-2 whitespace-nowrap',
    descTextarea: 'px-2 py-1 bg-white border rounded block w-full col-span-3',

    // Upload button row
    uploadBtnRow: 'flex justify-end items-center mb-1',
    uploadBtn: 'bg-green-200 hover:bg-green-300 hover:disabled:bg-green-200 mt-1 disabled:opacity-50 hover:disabled:cursor-not-allowed w-60 py-2 rounded cursor-pointer',

    // sourceCreate (internal_table)
    sourceCreateUploading: 'flex flex-col gap-4',
    sourceCreateIdle: 'flex flex-col gap-2',
    sourceCreateError: 'text-red-500 text-sm',
}
