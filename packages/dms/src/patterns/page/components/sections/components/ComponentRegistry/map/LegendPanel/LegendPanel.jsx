import React, { useMemo, Fragment } from 'react'
import { MapContext } from '../'
import { useNavigate } from 'react-router'
import { get } from 'lodash-es'
import { CMSContext } from '../../../../../../context'
import useMapLegendTheme from '../../../../../../../../ui/components/map/useMapLegendTheme'
export const fnumIndex = (d, fractions = 2, currency = false) => {
  if(isNaN(d)) return '0'
  if(typeof d === 'number' && d < 1) return `${currency ? '$' : ``} ${d?.toFixed(fractions)}`
  if (d >= 1_000_000_000_000_000) {
    return `${currency ? '$' : ``} ${(d / 1_000_000_000_000_000).toFixed(fractions)} Q`;
  }else if (d >= 1_000_000_000_000) {
    return `${currency ? '$' : ``} ${(d / 1_000_000_000_000).toFixed(fractions)} T`;
  } else if (d >= 1_000_000_000) {
    return `${currency ? '$' : ``} ${(d / 1_000_000_000).toFixed(fractions)} B`;
  } else if (d >= 1_000_000) {
    return `${currency ? '$' : ``} ${(d / 1_000_000).toFixed(fractions)} M`;
  } else if (d >= 1_000) {
    return `${currency ? '$' : ``} ${(d / 1_000).toFixed(fractions)} K`;
  } else {
    return typeof d === "object" ? `` : `${currency ? '$' : ``} ${parseInt(d)}`;
  }
}

const LegendSymbol = ({ layer, color, legendTheme }) => {
  if (layer?.type === 'circle') {
    const borderColor = get(layer, `layers[0].paint['circle-stroke-color']`, '#ccc')
    return (
      <div className={legendTheme.symbolWrapper}>
        <div className={legendTheme.symbolCircle} style={{ backgroundColor: color, borderColor }} />
      </div>
    )
  }

  if (layer?.type === 'line') {
    return (
      <div className={legendTheme.symbolWrapper}>
        <div className={legendTheme.symbolLine} style={{ backgroundColor: color }} />
      </div>
    )
  }

  return (
    <div className={legendTheme.symbolWrapper}>
      <div className={legendTheme.symbolFill} style={{ backgroundColor: color }} />
    </div>
  )
}

const typePaint = {
  'fill': (layer) => {

    return  get(layer, `layers[1].paint['fill-color']`, '#ccc')
  },
  'circle': (layer) => {
    return  get(layer, `layers[0].paint['circle-color']`, '#ccc')
      
  },
  'line': (layer) => {
    return get(layer, `layers[1].paint['line-color']`, '#ccc')
  }
}

function CategoryLegend({ layer, legendTheme }) {
  let  legenddata = layer?.['legend-data'] || []
  let paintValue = typeof typePaint[layer.type](layer) === 'object' ? typePaint[layer.type](layer) : []
  /**
   * Saved symbologies can carry an empty `legend-data` array. Fall back to the
   * paint-derived legend in that case so the runtime legend still renders.
   */
  const categories = legenddata?.length ? legenddata : (paintValue || []).filter((d,i) => i > 2 )
    .map((d,i) => {
      if(i%2 === 0) {
        return {color: d, label: paintValue[i+2]}
      }
      return null
    })
    .filter(d => d)
  
  return (
    <div className='w-full max-h-[250px] overflow-auto'>
        {categories.map((d,i) => (
          <div key={i} className={`${legendTheme.row} ${legendTheme.rowHover} flex w-full items-center border-0`}>
            <LegendSymbol layer={layer} color={d.color} legendTheme={legendTheme} />
            <div className={legendTheme.label}>{d.label}</div>
          </div> 
        ))}
    </div>
  )
}

function StepLegend({ layer, legendTheme }) {
  //console.log('StepLegend', layer)
  const { state, setState  } = React.useContext(MapContext);
  const { choroplethdata, legenddata } = useMemo(() => {
    return {
      choroplethdata: get(layer, `['choropleth-data']`, []), 
      legenddata: layer?.['legend-data'] || []
    }
  },[state])

  let paintValue = typeof typePaint[layer.type](layer) === 'object' ? typePaint[layer.type](layer) : []
  // Guard against an empty `choroplethdata`: `Math.max(...[])` is `-Infinity`,
  // which would render as the top band's upper bound (`… - -Infinity`). Only
  // take a max when there are real values; otherwise leave it undefined so the
  // open-ended top band renders as `X+` instead of a bogus `-Infinity`.
  const max = Array.isArray(choroplethdata) && choroplethdata.length ? Math.max(...choroplethdata) : undefined
  // console.log('StepLegend', paintValue, choroplethdata, Math.min(...choroplethdata), )
  /**
   * Choropleth legends use the same empty-array fallback so ranges still show
   * when `legend-data` exists as `[]` in the saved layer config.
   */
  const categories = legenddata?.length ? legenddata : [
    ...(paintValue || []).filter((d,i) => i > 2 )
    .map((d,i) => {

      if(i%2 === 1) {
        //console.log('test 123', d, i)
        const upper = paintValue[i + 4] ?? max;
        return {
          color: paintValue[i + 1],
          label: Number.isFinite(upper) ? `${paintValue[i + 2]} - ${upper}` : `${paintValue[i + 2]}+`,
        }
      }
      return null
    })
    .filter(d => d)
  ]

  return (
    <div className='w-full max-h-[250px] overflow-auto'>
        {categories.map((d,i) => (
          <div key={i} className={`${legendTheme.row} ${legendTheme.rowHover} flex w-full items-center border-0`}>
            <LegendSymbol layer={layer} color={d.color} legendTheme={legendTheme} />
            <div className={legendTheme.label}>{d.label}</div>
          </div> 
        ))}
    </div>
  )
}

function HorizontalLegend({ layer, legendTheme }) {
  let { legenddata, showOther } = useMemo(() => {
    return {
      legenddata : get(layer, `['legend-data']`, []),
      showOther: get(layer, `['category-show-other']`, '#ccc')
    }
  },[layer]);
  const isShowOtherEnabled = showOther === '#ccc';

  return (
    <div className={legendTheme.horizontalPanel}>
      <div className={legendTheme.horizontalTrack}>
        {legenddata.map((d, i) => (
          <div key={i} className="flex-1 h-6 overflow-hidden">
            <div className={legendTheme.secondaryLabel}>
              {isShowOtherEnabled && i === legenddata.length-1 ? 'N/A' : legenddata[i].label}
            </div>
            <div
              key={i}
              className="flex-1 h-2 w-20"
              style={{ backgroundColor: d.color }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CircleLegend({ layer, legendTheme }) {
  const { minRadius, maxRadius, lowerBound, upperBound, dataColumn } = useMemo(() => {
    return {
      minRadius: get(layer,`['min-radius']`, 8),
      maxRadius: get(layer,`['max-radius']`, 128),
      lowerBound: get(layer,`['lower-bound']`, null),
      upperBound: get(layer,`['upper-bound']`, null),
      dataColumn: get(layer, `['data-column']`, null)
    };
  }, [layer]);

  return (
    <div className={`w-[100%] max-h-[350px] overflow-x-auto scrollbar-sm text-sm ${legendTheme.label}`}>
      <div className={`w-[50%] max-h-[350px] overflow-x-auto scrollbar-sm text-sm ${legendTheme.label}`}>
        <div className="flex w-full justify-between">
          <div>{minRadius}px</div>
          <div>{maxRadius}px</div>
        </div>
        <div className="ml-8">
          <i
            class="fa-solid fa-arrow-right-long"
            style={{ transform: "scaleX(3)" }}
          ></i>
        </div>
        <div className="flex w-full justify-between">
          <div>{fnumIndex(lowerBound)}</div>
          <div>{fnumIndex(upperBound)}</div>
        </div>
      </div>
      <div>{dataColumn}</div>
    </div>
  );
}

const LegendRow = ({ index, layer, i, id, baseUrl }) => {
  const navigate = useNavigate();
  const  activeLayer  = null
  const legendTheme = useMapLegendTheme()
  const infoButtonStateClass = activeLayer == layer.id
    ? legendTheme.controlButtonActive
    : legendTheme.controlButtonInactive
  let paintValue = (typePaint[layer.type] || typePaint.fill)(layer)


  let { layerType: type, selectedInteractiveFilterIndex, legendOrientation } = useMemo(() => {
    return {
      layerType : get(layer, `['layer-type']`),
      selectedInteractiveFilterIndex: get(layer, `['selectedInteractiveFilterIndex']`),
      legendOrientation: get(layer, `['legend-orientation']`, 'vertical'),
    }
  },[layer]);


  const sourceUrl = `${baseUrl}/source/${layer.source_id}`

  const layerName = type === 'interactive' ? layer.label : layer.name;

  type = type === 'interactive' ? get(layer, `['interactive-filters'][${selectedInteractiveFilterIndex}]['layer-type']`) : type;

  return (
    <div className={`${legendTheme.row} ${legendTheme.rowHover} ${activeLayer == layer.id ? legendTheme.rowActive : ''}`}>
      <div className={legendTheme.titleRow}>
        {(type === 'simple' || !type) && <LegendSymbol layer={layer} color={paintValue} legendTheme={legendTheme} />}
        <div className={legendTheme.title}>
          {layerName}
          <div 
            className="cursor-pointer group/icon"
            onClick={(e) => {
              if (e.ctrlKey) {
                window.open(sourceUrl, "_blank");
              }
              else {
                navigate(sourceUrl);
              }
            }}
          >
            <span className={`mx-2 text-md fa fa-info ${legendTheme.infoIcon} ${infoButtonStateClass}`}/>
          </div>
        </div>
      </div>
        {legendOrientation === "horizontal" ? (
          <HorizontalLegend layer={layer} legendTheme={legendTheme} />
        ) : (
            type === 'circles' ? (
            <CircleLegend layer={layer} legendTheme={legendTheme} />
          ) : (
              <>
                {type === 'categories' && <CategoryLegend layer={layer} legendTheme={legendTheme} />}
                {type === 'choropleth' && <StepLegend layer={layer} legendTheme={legendTheme} />}
              </>
            )
        )}
    </div>
  )
}

const LegendPanel = (props) => {
  const { state, setState  } = React.useContext(MapContext);
  const { dataSourcesBaseUrl = '/cenrep' } = React.useContext(CMSContext);
  const legendTheme = useMapLegendTheme()
  const layersBySymbology = useMemo(() => {
    return Object.values(state?.symbologies || {})
      .filter(symb => symb.isVisible)
      .map((symb) => {
        return { name: symb.name, id: symb.id || symb.symbology_id, layers: { ...symb.symbology.layers }, pluginData: symb.symbology.pluginData };
      });
  }, [state]);

  /**
   * Default to showing legends when no plugin explicitly opts out. Missing or
   * empty `pluginData` should not suppress the entire legend panel.
   */
  const legendRows = layersBySymbology
    .filter(
      (symb) =>
        // Default to showing the legend when there is no plugin override.
        (!Object.keys(symb?.pluginData || {}).length ||
          Object.values(symb?.pluginData || {}).some(
            (layerPluginData) => layerPluginData?.["default-legend"] !== false,
          )) &&
        //look thru all layers within symb for an enabled legend
        Object.values(symb.layers).some(
          (layer) => layer?.["legend-orientation"] !== "none",
        ),
    )
    .map((symb) => (
      <div key={symb.id} className={legendTheme.section}>
        {Object.values(symb.layers)
          .sort((a, b) => b.order - a.order)
          //these condtionals filter out the layers themselves that do not have a legend enabled
          .filter((layer) => layer?.["legend-orientation"] !== "none")
          .map((layer, i) => (
            <LegendRow
              key={layer.id}
              baseUrl={dataSourcesBaseUrl}
              layer={layer}
              i={i}
              id={symb.id}
            />
          ))}
      </div>
    ));

  return (legendRows.length > 0 && 
    <>
      {/* ------Layer Pane ----------- */}
      <div className={legendTheme.panel}>
        <div className={legendTheme.panelInner}>
          {legendRows}
        </div>
      </div>
    </>
  )
}

export default LegendPanel
