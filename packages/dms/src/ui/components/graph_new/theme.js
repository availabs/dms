
const SharedThemeOptions = {
    text: "text-base font-regular",
    headerWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
    columnControlWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`,
    scaleWrapper: 'flex rounded-md p-1 divide-x border w-fit',
    scaleItem: 'font-semibold text-gray-500 hover:text-gray-700 px-2 py-1'
}

export const avlGraphTheme = {
    options: {
        activeStyle: 0
    },
    styles: [
        { name: "Light Mode",
            bgColor: "bg-white",
            textColor: "text-slate-800",
            ...SharedThemeOptions
        },
        { name: "Dark Mode",
            bgColor: "bg-slate-800",
            textColor: "text-white",
            ...SharedThemeOptions
        }
    ]
}

export const avlGraphSettings = theme => [
    { label: "Layout Group Styles",
        type: 'inline',
        controls: [
            { label: 'Style',
                type: 'Select',
                options: (theme?.avlGraph?.styles || [])
                    .map((k, i) => ({ label: k?.name || i, value: i })),
                path: `avlGraph.options.activeStyle`,
            }
        ]
    }
]