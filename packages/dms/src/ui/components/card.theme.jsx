export const dataCardTheme = {
    options: {
            activeStyle: 0
    },
    styles: [
        {
            name: 'default',

            header: 'w-full capitalize',
            value: 'w-full',
            valueWrapper: 'min-h-[20px]',
            description: 'w-full text-xs font-light',

            columnControlWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
            columnControlHeaderWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`,

            mainWrapperCompactView: 'grid',
            mainWrapperSimpleView: 'flex flex-col',

            subWrapper: 'w-full',
            subWrapperCompactView: 'flex flex-col rounded-[12px]',
            subWrapperSimpleView: 'grid',

            headerValueWrapper: 'w-full rounded-[12px] flex items-center justify-center p-2',
            headerValueWrapperCompactView: 'py-0',
            headerValueWrapperSimpleView: '',
            componentWrapper: 'w-full',
            headerValueWrapperBorderBelow: 'border-b rounded-none',

            itemBorder: 'border shadow',
            itemFlexCol: 'flex-col',
            itemFlexRow: 'flex-row',
            itemFlexColReverse: 'flex-col flex-col-reverse',
            itemFlexRowReverse: 'flex-row flex-row-reverse',
            iconAndColorValues: 'flex items-center gap-1.5 uppercase',

            formEditButtonsWrapper: 'self-end flex gap-0.5 text-sm',
            formEditSaveButton: 'bg-blue-300 hover:bg-blue-400 text-blue-700 rounded-lg w-fit px-2 py-0.5',
            formEditCancelButton: 'bg-red-300 hover:bg-red-400 text-red-700 rounded-lg w-fit px-2 py-0.5',
            formAddNewItemButton: 'bg-blue-300 hover:bg-blue-400 text-blue-700 rounded-lg w-fit px-2 py-0.5 text-sm self-end',

            justifyTextLeft: 'text-start justify-items-start  rounded-md',
            justifyTextRight: 'text-end justify-items-end rounded-md',
            justifyTextCenter: 'text-center justify-items-center rounded-md',

            textXS: 'text-xs font-medium',
            textXSReg: 'text-xs font-normal',
            textSM: 'text-sm font-medium',
            textSMReg: 'text-sm font-normal',
            textSMBold: 'text-sm font-normal',
            textSMSemiBold: 'text-sm font-semibold',
            textMD: 'text-md font-medium',
            textMDReg: 'text-md font-normal',
            textMDBold: 'text-md font-bold',
            textMDSemiBold: 'text-md font-semibold',
            textXL: 'text-xl font-medium',
            textXLSemiBold: 'text-xl font-semibold',
            text2XL: 'text-2xl font-medium',
            text2XLReg: 'text-2xl font-regular',
            text3XL: 'text-3xl font-medium',
            text3XLReg: 'text-3xl font-normal',
            text4XL: 'text-4xl font-medium',
            text5XL: 'text-5xl font-medium',
            text6XL: 'text-6xl font-medium',
            text7XL: 'text-7xl font-medium',
            text8XL: 'text-8xl font-medium',

            imgXS: "max-w-16 max-h-16",
            imgSM: "max-w-24 max-h-24",
            imgMD: "max-w-32 max-h-32",
            imgXL: "max-w-40 max-h-40",
            img2XL: "max-w-48 max-h-48",
            img3XL: "max-w-56 max-h-56",
            img4XL: "max-w-64 max-h-64",
            img5XL: "max-w-72 max-h-72",
            img6XL: "max-w-80 max-h-80",
            img7XL: "max-w-96 max-h-96",
            img8XL: "max-w-128 max-h-128",
            imgDefault: 'max-w-[50px] max-h-[50px]'
        }
    ]
}
// used in theme editor
export const cardSettings = (theme) => [
    {
        label: "Layout Group Styles",
        type: 'inline',
        controls: [
            {
                label: 'Style',
                type: 'Select',
                options: (theme?.dataCard?.styles || [{}])
                    .map((k, i) => ({ label: k?.name || i, value: i })),
                path: `dataCard.options.activeStyle`,
            },
            {
                label: 'Add Style',
                type: 'Button',
                children: <div>Add Style</div>,
                onClick: (e, setState) => {
                    setState(draft => {
                        draft.dataCard.styles.push({ ...draft.dataCard.styles[0], name: 'new style', })

                    })
                }
            },
            {
                label: 'Remove Style',
                type: 'Button',
                children: <div>Remove Style</div>,
                //disabled:
                onClick: (e, setState) => {
                    setState(draft => {
                        if (draft.dataCard.styles.length > 1) {
                            draft.dataCard.styles.splice(theme.dataCard.options.activeStyle, 1)
                            draft.dataCard.options.activeStyle = 0
                        }
                    })
                }
                //path: `sidenav.styles[${activeStyle}].outerWrapper`,
            },
        ]
    },
    {
        label: "Card",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.dataCard?.styles?.[theme?.dataCard?.options?.activeStyle || 0] )
                .filter(k => !k.startsWith('text') && !k.startsWith('img') && !k.startsWith('justify') && !k.includes('Wrapper'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `dataCard.styles[${theme?.dataCard?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Wrappers",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.dataCard?.styles?.[theme?.dataCard?.options?.activeStyle || 0] )
                .filter(k => k.includes('Wrapper'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `dataCard.styles[${theme?.dataCard?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Text",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.dataCard?.styles?.[theme?.dataCard?.options?.activeStyle || 0] )
                .filter(k => k.startsWith('text'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `dataCard.styles[${theme?.dataCard?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Image",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.dataCard?.styles?.[theme?.dataCard?.options?.activeStyle || 0] )
                .filter(k => k.startsWith('img'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `dataCard.styles[${theme?.dataCard?.options?.activeStyle}].${k}`
                    }
                })
        ]
    },
    {
        label: "Justify",
        type: 'inline',
        controls: [
            ...Object.keys(theme?.dataCard?.styles?.[theme?.dataCard?.options?.activeStyle || 0] )
                .filter(k => k.startsWith('justify'))
                .map(k => {
                    return {
                        label: k,
                        type: 'Textarea',
                        path: `dataCard.styles[${theme?.dataCard?.options?.activeStyle}].${k}`
                    }
                })
        ]
    }
];
const demoColumns = [
    { "name": "first_name", "display_name": "First Name", "show": true, "type": "text", "description": "Column description" },
    { "name": "last_name", "display_name": "Last Name", "show": true, "type": "text" },
    { "name": "email", "display_name": "Email Address", "show": true, "type": "text" },
    { "name": "city", "display_name": "City", "show": true, "type": "text" }
]

const demoData = [
    {
        "first_name": "Alice",
        "last_name": "Johnson",
        "email": "alice.johnson@example.com",
        "city": "New York"
    },
    {
        "first_name": "Bob",
        "last_name": "Smith",
        "email": "bob.smith@example.com",
        "city": "Los Angeles"
    },
    {
        "first_name": "Carol",
        "last_name": "Davis",
        "email": "carol.davis@example.com",
        "city": "Chicago"
    },
    {
        "first_name": "David",
        "last_name": "Brown",
        "email": "david.brown@example.com",
        "city": "Houston"
    }
]
export const docs = [
    {
        columns: demoColumns,
        data: demoData,
        display: {
            compactView: true
        }
    },
    {
        columns: demoColumns,
        data: demoData,
        display: {
            compactView: false
        }
    }]
