import React, {useContext, useMemo} from "react";
import {ComponentContext} from "../../dataWrapper";
import TableHeaderCell from "../spreadsheet/components/TableHeaderCell";
import {getColorRange, GraphComponent} from "./GraphComponent";
import AppearanceControls from "./controls/AppearanceControls";
import {isEqualColumns} from "../../dataWrapper/utils/utils";
import {cloneDeep} from "lodash-es";
import {Copy} from "../../../../icons";

const NaNValues = ["", null]

const strictNaN = v => {
    if (NaNValues.includes(v)) return true;
    return isNaN(v);
}

const defaultTheme = ({
    headerWrapper: 'grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5',
    columnControlWrapper: `px-1 font-semibold border bg-gray-50 text-gray-500`
})

const Graph = ({isEdit}) => {
    const {state:{columns, data, display}} = useContext(ComponentContext);
    // data is restructured into: index, type, value.
    // index is X axis column's values.
    // type is either category column's values or Y axis column's display name or name.
    const indexColumn = useMemo(() => columns.find(({xAxis}) => xAxis) || {}, [columns]);
    const dataColumns = useMemo(() => columns.filter(({yAxis}) => yAxis) || [], [columns]);
    const categoryColumn = useMemo(() => columns.find(({categorize}) => categorize) || {}, [columns]);
    const {headerWrapper, columnControlWrapper} = defaultTheme;

    const graphData = useMemo(() => {
        const tmpData = [];
        data.forEach(row => {
            const index = row[indexColumn.name] && typeof row[indexColumn.name] !== 'object' && typeof row[indexColumn.name] !== 'string' ?
                            row[indexColumn.name].toString() : row[indexColumn.name];
            dataColumns.forEach(dataColumn => {
                const value = row[dataColumn.normalName || dataColumn.name];
                const type = categoryColumn.name ? row[categoryColumn.name] : (dataColumn.customName || dataColumn.display_name || dataColumn.name)

                if(!strictNaN(value) && type){
                    tmpData.push({index, type, value, aggMethod: dataColumn.fn});
                }
            })
        })
        return tmpData
        }, [indexColumn, dataColumns.length, categoryColumn, data])

    const colorPaletteSize = categoryColumn.name ? (new Set(data.map(item => item[categoryColumn.name]))).size : dataColumns.length

    const colors = useMemo(() => ({
        type: "palette",
        value: [...getColorRange(colorPaletteSize < 20 ? colorPaletteSize : 20, "div7")]
    }), [colorPaletteSize])


    return (
        <>
            {
                isEdit ? <div className={headerWrapper}>
                    {[indexColumn, ...dataColumns].filter(f => f.name).map((attribute, i) =>
                        <div key={`controls-${i}`} className={columnControlWrapper}>
                            <TableHeaderCell
                                isEdit={isEdit}
                                attribute={attribute}
                            />
                        </div>)}
                </div> : null
            }
            <GraphComponent
            graphFormat={ {...display, colors} }
            activeGraphType={{GraphComp: display.graphType} }
            viewData={ graphData }
            showCategories={ Boolean(categoryColumn.name) || (dataColumns.length > 1) }
            xAxisColumn={ indexColumn }
            yAxisColumns={ dataColumns }/>
        </>
    )
}

const DefaultPalette = getColorRange(20, "div7");
const graphOptions = {
    graphType: 'BarGraph',
    groupMode: 'stacked',
    orientation: 'vertical',
    showAttribution: true,
    title: {
        title: "",
        position: "start",
        fontSize: 32,
        fontWeight: "bold"
    },
    description: "",
    bgColor: "#ffffff",
    textColor: "#000000",
    colors: {
        type: "palette",
        value: [...DefaultPalette]
    },
    height: 300,
    width: undefined,
    margins: {
        marginTop: 20,
        marginRight: 20,
        marginBottom: 50,
        marginLeft: 100
    },
    xAxis: {
        label: "",
        rotateLabels: false,
        showGridLines: false,
        tickSpacing: 1
    },
    yAxis: {
        label: "",
        showGridLines: true,
        tickFormat: "Integer"
    },
    legend: {
        show: true,
        label: "",
    },
    tooltip: {
        show: true,
        fontSize: 12
    }
}
const defaultState = {
    dataRequest: {},
    columns: [],
    data: [],
    display: graphOptions,
    sourceInfo: { columns: [] }
}

export default {
    "name": 'Graph',
    "type": 'Graph',
    "variables": [],
    useDataSource: true,
    fullDataLoad: true,
    useGetDataOnPageChange: false,
    showPagination: false,
    defaultState,
    controls: {
        columns: [
            // settings from columns dropdown are stored in state.columns array, per column
            {type: 'select', label: 'Fn', key: 'fn', disabled: ({attribute}) => !attribute.yAxis || !attribute.show,
                options: [
                    {label: 'fn', value: ' '}, {label: 'list', value: 'list'}, {label: 'sum', value: 'sum'}, {label: 'count', value: 'count'}
                ]},
            {type: 'select', label: 'Exclude N/A', key: 'excludeNA',
                options: [
                    {label: 'include n/a', value: false}, {label: 'exclude n/a', value: true}
                ]},
            {type: 'toggle', label: 'X Axis', key: 'xAxis', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.yAxis || attribute.categorize) return;

                    // turn off other xAxis columns
                    state.columns.forEach(column => {
                        // if xAxis true, for original column set to true. for others false.
                        column.xAxis = value ? column.name === attribute.name : value;
                        // if turning xAxis off, and not original column, check their category settings.
                        column.group = column.name === attribute.name ? value : column.categorize;
                        column.show = column.name === attribute.name ? value : column.yAxis || column.categorize;
                    })

                }},
            {type: 'toggle', label: 'Y Axis', key: 'yAxis', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.xAxis || attribute.categorize) return;

                    // update default function and add Y Axis column to "show"
                    const defaultFn = state.columns[columnIdx].defaultFn?.toLowerCase();
                    state.columns[columnIdx].fn = value ? (['sum', 'count'].includes(defaultFn) ? defaultFn : 'count') : ''
                    state.columns[columnIdx].show = value;
                }},
            {type: 'toggle', label: 'Categorize', key: 'categorize', onChange: ({key, value, attribute, state, columnIdx}) => {
                    if(attribute.xAxis || attribute.yAxis) return;

                    // turn off other Category columns
                    state.columns.forEach(column => {
                        // if Category true, for original column set to true. for others false.
                        column.categorize = value ? column.name === attribute.name : value;
                        // if turning Category off, and not original column, check their xAxis settings.
                        column.group = column.name === attribute.name ? value : column.xAxis;
                        column.show = column.name === attribute.name ? value : column.yAxis || column.xAxis;
                    })
                }},

            {type: 'toggle', label: 'Filter', key: 'filters', trueValue: [{type: 'internal', operation: 'filter', values: []}]},
            {type: ({attribute, setState}) => {
                    const duplicate = () => {
                        setState(draft => {
                            let idx = draft.columns.findIndex(col => isEqualColumns(col, attribute));
                            if (idx === -1) {
                                draft.columns.push({...attribute, normalName: `${attribute.name}_original`});
                                idx = draft.columns.length - 1; // new index
                            }
                            const columnToAdd = cloneDeep(draft.columns[idx]);
                            const numDuplicates = draft.columns.filter(col => col.isDuplicate && col.name === columnToAdd.name).length;

                            columnToAdd.isDuplicate = true;
                            columnToAdd.copyNum = numDuplicates + 1;
                            columnToAdd.normalName = `${columnToAdd.name}_copy_${numDuplicates + 1}`
                            // columnToAdd.originalName = columnToAdd.name;
                            // columnToAdd.name += ` - copy - ${numDuplicates}`
                            console.log('column to add', columnToAdd)
                            draft.columns.push(columnToAdd)
                            // draft.columns.splice(idx, 0, columnToAdd)
                        })
                    }
                    return (
                        <div className={'flex place-content-center'} onClick={() => duplicate()}>
                            <Copy className={'text-gray-500 hover:text-gray-700'} />
                        </div>)
                }, label: 'duplicate'},
        ],
        appearance: {Comp: AppearanceControls},
        inHeader: [
            {type: 'select', label: 'Sort', key: 'sort',
                options: [
                    {label: 'Not Sorted', value: ''}, {label: 'A->Z', value: 'asc nulls last'}, {label: 'Z->A', value: 'desc nulls last'}
                ]},
            {type: 'select', label: 'Format', key: 'formatFn',
                options: [
                    {label: 'No Format Applied', value: ' '},
                    {label: 'Comma Seperated', value: 'comma'},
                    {label: 'Abbreviated', value: 'abbreviate'},
                ]},
        ]
    },
    "EditComp": Graph,
    "ViewComp": Graph,
}