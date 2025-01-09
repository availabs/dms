import React, {useMemo, useState} from "react"

import get from "lodash/get"
import set from "lodash/set"
import merge from "lodash/merge"
import isEqual from "lodash/isEqual"
import uniq from "lodash/uniq"

import { format as d3format } from "d3-format"
import {AxisControls} from "../shared/AxisControls";
import {FormsSelector} from "../../FormsSelector";

const IntFormat = d3format(",d");


const EditComp = ({ onChange, value, pgEnv = "hazmit_dama", apiLoad, pageFormat }) => {
  const [format, setFormat] = useState({});
  const [view, setView] = useState();
  const [xAxis, setXAxis] = useState({});
  const [yAxis, setYAxis] = useState({});
  const [intFilters, setIntFilters] = useState([]);
  const [extFilters, setExtFilters] = useState([]);
  const [title, setTitle] = useState({}); // {title, position, fontSize, fontWeight}
  const [legend, setLegend] = useState({}); // {label, position, width, height}
  const columns = useMemo(() => JSON.parse(format?.config || '{}')?.attributes || format?.metadata?.columns || [], [format]);

  console.log('format', format, columns);

  // const [viewData, viewDataLength] = useGetViewData({ pgEnv,
  //                                                     activeView,
  //                                                     xAxisColumn,
  //                                                     yAxisColumns,
  //                                                     filters,
  //                                                     externalFilters,
  //                                                     category
  //                                                   });
  //
  // const dataDomain = React.useMemo(() => {
  //   return viewData.map(vd => vd.value);
  // }, [viewData]);
  //
  // const okToSave = React.useMemo(() => {
  //   const { state: savedState, viewData: savedData } = JSON.parse(value || "{}");
  //   return Boolean(viewData.length) && (!isEqual(savedState, state) || !isEqual(viewData, savedData));
  // }, [state, viewData, value]);
  //
  // const doOnChange = React.useCallback(e => {
  //   if (!okToSave) return;
  //   onChange(JSON.stringify({ state, viewData }));
  // }, [onChange, state, viewData, okToSave]);

  // React.useEffect(() => {
  //   if (okToSave) {
  //     doOnChange();
  //   }
  // }, [okToSave, doOnChange]);
  //
  // const colorMap = React.useMemo(() => {
  //
  //   const colorType = get(graphFormat, ["colors", "type"]);
  //
  //   const isPalette = ((colorType === "palette") || (colorType === "custom"));
  //
  //   if (!isPalette) return {};
  //
  //   const types = viewData.reduce((a, c) => {
  //     const type = c.type;
  //     if (!a.includes(type)) {
  //       a.push(type);
  //     }
  //     return a;
  //   }, []).sort((a, b) => a.localeCompare(b));
  //
  //   const palette = get(graphFormat, ["colors", "value"], []);
  //
  //   return types.reduce((a, c, i) => {
  //     a[c] = palette[i % palette.length];
  //     return a;
  //   }, {});
  // }, [viewData, graphFormat]);
  //
  // const filteredData = useFilterViewData({ viewData, filters: externalFilters });
  //
  // const updatedGraphFormat = React.useMemo(() => {
  //
  //   const colorType = get(graphFormat, ["colors", "type"]);
  //
  //   const isPalette = ((colorType === "palette") || (colorType === "custom"));
  //
  //   if (!isPalette) return graphFormat;
  //
  //   const types = filteredData.reduce((a, c) => {
  //     const type = c.type;
  //     if (!a.includes(type)) {
  //       a.push(type);
  //     }
  //     return a;
  //   }, []).sort((a, b) => a.localeCompare(b));
  //
  //   const palette = types.map(type => colorMap[type]);
  //
  //   return {
  //     ...graphFormat,
  //     colors: {
  //       ...graphFormat.colors,
  //       value: palette
  //     }
  //   }
  // }, [colorMap, filteredData, graphFormat]);

  return (
    <div className="grid grid-cols-1 gap-2">
      <FormsSelector apiLoad={apiLoad} app={pageFormat?.app}
                     format={format} setFormat={setFormat}
                     view={view} setView={setView}
      />
      <div className={'flex gap-0.5'}>
        {/*<AxisControls*/}
        {/*    axis={'x'}*/}
        {/*    attributes={columns}*/}
        {/*    label={graphFormat?.xAxis?.label} setLabel={value => refreshState({...state, graphFormat: {...graphFormat, xAxis: {...(graphFormat?.xAxis || {}), label: value}}})}*/}
        {/*    column={xAxisColumn} setColumn={setXAxisColumn}*/}
        {/*    sort={xAxisColumn?.sortMethod} setSort={value => updateXAxisColumn({...(xAxisColumn || {}), sortMethod: value})}*/}
        {/*    tickSpacing={graphFormat?.xAxis?.tickSpacing} setTickSpacing={value => refreshState({...state, graphFormat: {...graphFormat, xAxis: {...(graphFormat?.xAxis || {}), tickSpacing: value}}})}*/}
        {/*    tickFormat={graphFormat?.xAxis?.tickFormat} setTickFormat={value => refreshState({...state, graphFormat: {...graphFormat, xAxis: {...(graphFormat?.xAxis || {}), tickFormat: value}}})}*/}
        {/*    showGridLines={graphFormat?.xAxis?.showGridLines} setShowGridLines={value => refreshState({...state, graphFormat: {...graphFormat, xAxis: {...(graphFormat?.xAxis || {}), showGridLines: value}}})}*/}
        {/*    rotateLabels={graphFormat?.xAxis?.rotateLabels} setRotateLabels={value => refreshState({...state, graphFormat: {...graphFormat, xAxis: {...(graphFormat?.xAxis || {}), rotateLabels: value}}})}*/}
        {/*/>*/}
        {/*<AxisControls*/}
        {/*    multiselect={true}*/}
        {/*    axis={'y'}*/}
        {/*    attributes={columns}*/}
        {/*    label={graphFormat?.yAxis?.label} setLabel={value => refreshState({...state, graphFormat: {...graphFormat, yAxis: {...(graphFormat?.yAxis || {}), label: value}}})}*/}
        {/*    column={yAxisColumns} setColumn={setYAxisColumns} // [{}]*/}
        {/*    categorizeColumn={category} setCategorizeColumn={setCategory}*/}
        {/*    fn={yAxisColumns?.aggMethod} setSort={value => updateYAxisColumn({...(yAxisColumns || {}), aggMethod: value})}*/}
        {/*    tickSpacing={graphFormat?.yAxis?.tickSpacing} setTickSpacing={value => refreshState({...state, graphFormat: {...graphFormat, yAxis: {...(graphFormat?.yAxis || {}), tickSpacing: value}}})}*/}
        {/*    tickFormat={graphFormat?.yAxis?.tickFormat} setTickFormat={value => refreshState({...state, graphFormat: {...graphFormat, yAxis: {...(graphFormat?.yAxis || {}), tickFormat: value}}})}*/}
        {/*    showGridLines={graphFormat?.yAxis?.showGridLines} setShowGridLines={value => refreshState({...state, graphFormat: {...graphFormat, yAxis: {...(graphFormat?.yAxis || {}), showGridLines: value}}})}*/}
        {/*    rotateLabels={graphFormat?.yAxis?.rotateLabels} setRotateLabels={value => refreshState({...state, graphFormat: {...graphFormat, yAxis: {...(graphFormat?.yAxis || {}), rotateLabels: value}}})}*/}
        {/*/>*/}

      </div>

    </div>
  )
}


const ExternalFilterSelect = ({ filter, update, viewData, textColor, editMode }) => {

  const domain = React.useMemo(() => {
    const domain = viewData.map(d => get(d, ["externalData", filter.column.name], null));
    return uniq(domain)
            .sort((a, b) => a < b ? -1 : a > b ? 1 : 0)
            .map(d => ({ name: d, value: d }));
  }, [filter, viewData]);

  const domainOptions = React.useMemo(() => {
    return [
      { name: "Add All",
        value: "add-all"
      },
      { name: "Remove All",
        value: "remove-all"
      },
      ...domain
    ]
  }, [domain]);

  const [selected, setSelected] = React.useState([]);

  const onChange = React.useCallback(v => {
    const addAll = v.reduce((a, c) => {
      return a || (c === "add-all");
    }, false);
    if (addAll) {
      return update(filter, { values: domain.map(d => d.value) });
    }

    const removeAll = v.reduce((a, c) => {
      return a || (c === "remove-all");
    }, false);
    if (removeAll) {
      return update(filter, { values: [] });
    }

    update(filter, { values: v });
  }, [filter, update, domain]);

  const placeholder = React.useMemo(() => {
    return editMode ?
            "Set default filter values..." :
            "Set filter values..."
  }, [editMode]);

  return (
    <div>
      <div className="font-bold"
        style={ { color: textColor } }
      >
        { capitalize(filter.column.name) } Filter
      </div>
      <MultiLevelSelect isMulti removable
        placeholder={ placeholder }
        options={ domainOptions }
        value={ filter.values }
        onChange={ onChange }
        displayAccessor={ o => o.name }
        valueAccessor={ o => o.value }/>
    </div>
  )
}

const ExternalFiltersControls = props => {
  const {
    filters,
    updateFilter,
    viewData,
    bgColor,
    textColor,
    editMode = false
  } = props;

  if (!filters.length) return null;

  return (
    <div className="grid grid-cols-3 gap-4 p-4"
      style={ { backgroundColor: bgColor } }
    >
      { filters.map(f => (
          <ExternalFilterSelect key={ f.column.name }
            filter={ f }
            update={ updateFilter }
            viewData={ viewData }
            textColor={ textColor }
            editMode={ editMode }/>
        ))
      }
    </div>
  )
}

const useFilterViewData = ({ viewData, filters }) => {
  return React.useMemo(() => {
    const activefilters = filters.filter(f => f.values.length);
    if (!activefilters.length) return viewData;
    return viewData.filter(vd => {
      return activefilters
        .reduce((a, c) => {
          const fValues = c.values;
          const col = c.column.name;
          const vdValue = get(vd, ["externalData", col], null);
          return a || fValues.includes(vdValue);
        }, false);
    })
  }, [viewData, filters]);
}

const ViewComp = ({ value }) => {

  const { state, viewData } = React.useMemo(() => {
    return JSON.parse(value || "{}");
  }, [value]);

  if (!state) {
    return null;
  }

  const {
    graphFormat,
    activeGraphType,
    category,
    xAxisColumn,
    yAxisColumns,
    externalFilters
  } = state;

  if (!get(viewData, "length", 0)) {
    return null;
  }

  const [filters, setFilters] = React.useState([]);

  React.useEffect(() => {
    setFilters([...externalFilters]);
  }, [externalFilters]);

  const updateFilter = React.useCallback((filter, update) => {
    setFilters(filters => {
      return filters.map(f => {
        if (f === filter) {
          return { ...f, ...update };
        }
        return f;
      })
    })
  }, []);

  const colorMap = React.useMemo(() => {

    const colorType = get(graphFormat, ["colors", "type"]);

    const isPalette = ((colorType === "palette") || (colorType === "custom"));

    if (!isPalette) return {};

    const types = viewData.reduce((a, c) => {
      const type = c.type;
      if (!a.includes(type)) {
        a.push(type);
      }
      return a;
    }, []).sort((a, b) => a.localeCompare(b));

    const palette = get(graphFormat, ["colors", "value"], []);

    return types.reduce((a, c, i) => {
      a[c] = palette[i % palette.length];
      return a;
    }, {});
  }, [viewData, graphFormat]);

  const filteredData = useFilterViewData({ viewData, filters });

  const updatedGraphFormat = React.useMemo(() => {

    const colorType = get(graphFormat, ["colors", "type"]);

    const isPalette = ((colorType === "palette") || (colorType === "custom"));

    if (!isPalette) return graphFormat;

    const types = filteredData.reduce((a, c) => {
      const type = c.type;
      if (!a.includes(type)) {
        a.push(type);
      }
      return a;
    }, []).sort((a, b) => a.localeCompare(b));

    const palette = types.map(type => colorMap[type]);

    return {
      ...graphFormat,
      colors: {
        ...graphFormat.colors,
        value: palette
      }
    }
  }, [colorMap, filteredData, graphFormat]);

  return (
    <div>
      <ExternalFiltersControls
        filters={ filters }
        updateFilter={ updateFilter }
        viewData={ viewData }
        bgColor={ graphFormat.bgColor }
        textColor={ graphFormat.textColor }/>

      <GraphComponent
        graphFormat={ updatedGraphFormat }
        activeGraphType={ activeGraphType }
        viewData={ filteredData }
        showCategories={ Boolean(category) || (yAxisColumns.length > 1) }
        xAxisColumn={ xAxisColumn }
        yAxisColumns={ yAxisColumns }/>
    </div>
  )
}
const PlaceHolder = () => <div>The component will be available soon.</div>
const GraphComp = {
  name: "graph",
  type: "Graph",
  EditComp: PlaceHolder,
  ViewComp: PlaceHolder
}
export default GraphComp
