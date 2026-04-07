import Table from "./index";

const TableDocs = {
    name: "Table",
    themeVar: "table",
    description: "A responsive vertical navigation component.",
    props: [

        {
            name: "columns",
            type: "data",
            default: [],
        },
        {
            name: "data",
            type: "data",
            default: []
        },
        {
            name: "disableFilters",
            type: "boolean",
            default: false
        },
        {
            name: "disableSortBy",
            type: "boolean",
            default: false
        },
        {
            name: "pageSize",
            type: "number",
            default: 10
        },
    ],
    dependencies: [
        // {
        //     name: "Nav Item",
        //     theme: ["navitemSide", "navitemSideActive"],
        // },
    ],
    examples: [
        {
            title: 'Simple Table',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <Table {...props} />
                </div>
            ),
            props: [
                {
                    name: "data",
                    default: [
                        {col1: 'data for col1 row1',
                            col2: 'data for col2 row1',
                            col3: 'data for col3 row1',
                            col4: 'data for col3 row1',
                            col5: 'data for col3 row1',
                            col6: 'data for col3 row1',
                            col7: 'data for col3 row1',
                        },
                        {col1: 'data for col1 row2',
                            col2: 'data for col2 row2',
                            col3: 'data for col3 row2',
                            col4: 'data for col3 row1',
                            col5: 'data for col3 row1',
                            col6: 'data for col3 row1',
                            col7: 'data for col3 row1',}
                    ],
                },
                {
                    name: "columns",
                    default: [
                        {Header: 'col1', accessor: 'col1'},
                        {Header: 'col2', accessor: 'col2'},
                        {Header: 'col3', accessor: 'col3'},
                        {Header: 'col4', accessor: 'col4'},
                        {Header: 'col5', accessor: 'col5'},
                        {Header: 'col6', accessor: 'col6'},
                        {Header: 'col7', accessor: 'col7'},
                    ],
                },
                {
                    name: 'disableFilters',
                    default: true
                },
                {
                    name: 'disableSortBy',
                    default: true
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact'
                    }
                },
            ],

        },
        {
            title: 'Filters',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <Table {...props} />
                </div>
            ),
            props: [
                {
                    name: "data",
                    default: [
                        {col1: 'data for col1 row1',
                            col2: 'data for col2 row1',
                            col3: 'data for col3 row1',
                            col4: 'data for col3 row1',
                            col5: 'data for col3 row1',
                            col6: 'data for col3 row1',
                            col7: 'data for col3 row1',
                        },
                        {col1: 'data for col1 row2',
                            col2: 'data for col2 row2',
                            col3: 'data for col3 row2',
                            col4: 'data for col3 row1',
                            col5: 'data for col3 row1',
                            col6: 'data for col3 row1',
                            col7: 'data for col3 row1',}
                    ],
                },
                {
                    name: "columns",
                    default: [
                        {Header: 'col1', accessor: 'col1'},
                        {Header: 'col2', accessor: 'col2'},
                        {Header: 'col3', accessor: 'col3'},
                        {Header: 'col4', accessor: 'col4'},
                        {Header: 'col5', accessor: 'col5'},
                        {Header: 'col6', accessor: 'col6'},
                        {Header: 'col7', accessor: 'col7'},
                    ],
                },
                {
                    name: 'disableFilters',
                    default: false
                },
                {
                    name: 'disableSortBy',
                    default: true
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact'
                    }
                },
            ],

        },
        {
            title: 'Column specific filters',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <Table {...props} />
                </div>
            ),
            props: [
                {
                    name: "data",
                    default: [
                        {col1: 'data for col1 row1', col2: 'data for col2 row1', col3: 'data for col3 row1'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'}
                    ],
                },
                {
                    name: "columns",
                    default: [
                        {Header: 'col1', accessor: 'col1', filterLocation: 'inline'}, {Header: 'col2', accessor: 'col2', disableFilters: true}, {Header: 'col3', accessor: 'col3'},
                    ],
                },
                {
                    name: 'disableSortBy',
                    default: true
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact'
                    }
                },
            ],

        },


        {
            title: 'Sortable columns',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <Table {...props} />
                </div>
            ),
            props: [
                {
                    name: "data",
                    default: [
                        {col1: 'data for col1 row1', col2: 'data for col2 row1', col3: 'data for col3 row1'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'}
                    ],
                },
                {
                    name: "columns",
                    default: [
                        {Header: 'col1', accessor: 'col1'}, {Header: 'col2', accessor: 'col2'}, {Header: 'col3', accessor: 'col3'},
                    ],
                },
                {
                    name: 'disableFilters',
                    default: true
                },
                {
                    name: 'disableSortBy',
                    default: false
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact'
                    }
                },
            ],

        },
        {
            title: 'Column specific sort',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <Table {...props} />
                </div>
            ),
            props: [
                {
                    name: "data",
                    default: [
                        {col1: 'data for col1 row1', col2: 'data for col2 row1', col3: 'data for col3 row1'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'}
                    ],
                },
                {
                    name: "columns",
                    default: [
                        {Header: 'col1', accessor: 'col1'}, {Header: 'col2', accessor: 'col2', disableSortBy: true}, {Header: 'col3', accessor: 'col3'},
                    ],
                },
                {
                    name: 'disableFilters',
                    default: true
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact'
                    }
                },
            ],

        },

        {
            title: 'Filter: Dropdown',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <Table {...props} />
                </div>
            ),
            props: [
                {
                    name: "data",
                    default: [
                        {col1: 'data for col1 row1', col2: 'data for col2 row1', col3: 'data for col3 row1', col4: 'data for col3 row1', col5: 'data for col3 row1', col6: 'data for col3 row1'},
                        {col1: 'data', col2: 'row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                        {col1: 'data for col1 row2', col2: 'data for col2 row2', col3: 'data for col3 row2'},
                    ],
                },
                {
                    name: "columns",
                    default: [
                        {Header: 'col1', accessor: 'col1',
                            filter: 'dropdown',
                            filterDomain: ['custom option 1', 'custom option 2', 'data for col1 row1'],
                            customValue: 'custom option 2',
                            filterThemeOptions: {size: 'mini'},
                            filterClassName: 'w-full text-sm z-50',
                            filterMulti: true
                        },

                        {Header: 'col2', accessor: 'col2',
                            filter: 'dropdown',
                            filterThemeOptions: {size: 'mini'}, filterClassName: 'w-full text-sm z-50',
                            filterMulti: false, filterRemovable: true},

                        {Header: 'col3', accessor: 'col3',
                            filter: 'dropdown',
                            filterThemeOptions: {size: 'mini'}, filterClassName: 'w-full text-sm z-50',
                            filterMulti: false, filterRemovable: false
                        },
                        {Header: 'col4', accessor: 'col4'},
                        {Header: 'col5', accessor: 'col5'},
                        {Header: 'col6', accessor: 'col6'},
                    ],
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact'
                    }
                },
            ],

        },
    ],
};

export default TableDocs;
