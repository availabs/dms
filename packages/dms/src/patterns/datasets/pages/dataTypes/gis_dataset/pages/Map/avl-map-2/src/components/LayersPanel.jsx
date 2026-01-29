import React from "react"

import get from "lodash/get"

import { useComponentLibrary } from "./StyledComponents"
import { MultiLevelSelect, useTheme } from "../uicomponents"

const DynamicDestroyButton = ({ destroyDynamicLayer }) => {
  const [seconds, setSeconds] = React.useState(0);
  const timeout = React.useRef();

  React.useEffect(() => {
    if (seconds > 0) {
      timeout.current = setTimeout(setSeconds, 1000, seconds - 1);
    }
  }, [seconds]);

  const onClick = React.useCallback(e => {
    e.stopPropagation();
    if (seconds === 0) {
      setSeconds(3);
    }
    else {
      setSeconds(0);
      clearTimeout(timeout.current);
      destroyDynamicLayer();
    }
  }, [destroyDynamicLayer, seconds]);

  const { LayerPanelHeaderButton } = useComponentLibrary();

  return (
    <LayerPanelHeaderButton onClick={ onClick }>
      { !seconds ? null :
        <span className="absolute inset-0 flex items-center justify-center text-white font-bold">
          { seconds }
        </span>
      }
      <span className="fa fa-trash text-red-500"/>
    </LayerPanelHeaderButton>
  )
}

const LayerPanelHeader = ({ layer, MapActions, children }) => {
  const deactivateLayer = React.useCallback(e => {
    e.stopPropagation();
    MapActions.deactivateLayer(layer.id);
  }, [MapActions.deactivateLayer, layer.id]);
  const destroyDynamicLayer = React.useCallback(e => {
    MapActions.destroyDynamicLayer(layer.id);
  }, [MapActions.destroyDynamicLayer, layer.id]);

  const { LayerPanelHeaderButton } = useComponentLibrary();

  return (
    <>
      <div className="flex">
        <div className="flex-1 font-bold">
          { layer.name || "AVL Layer" }
        </div>
        <div className="flex-0">
          { !layer.isDynamic ? null :
            <DynamicDestroyButton destroyDynamicLayer={ destroyDynamicLayer }/>
          }
          <LayerPanelHeaderButton onClick={ deactivateLayer }>
            <span className="fa fa-close"/>
          </LayerPanelHeaderButton>
        </div>
      </div>
      <div className="flex">
        <div className="flex-0 flex">
          { children }
        </div>
      </div>
    </>
  )
}

const FilterWrapper = Filter => {
  return ({ MapActions, layer, id, ...props }) => {
    const onChange = React.useCallback(v => {
      MapActions.updateFilter(layer, id, v);
    }, [MapActions.updateFilter, layer, id])
    return (
      <Filter { ...props } layer={ layer } id={ id }
        MapActions={ MapActions }
        onChange={ onChange }/>
    )
  }
}
const UnknownFilter = ({ type }) => {
  const theme = useTheme();
  return (
    <div className={ `px-2 py-1 rounded outline outline-1 ${ theme.outline }` }>
      Unknown filter type: "{ type }"
    </div>
  )
}

const LayerPanel = ({ layer, MapActions, filterUpdate, ...props }) => {
  const [open, setOpen] = React.useState(false);
  const toggleOpen = React.useCallback(e => {
    e.stopPropagation();
    setOpen(o => !o);
  }, []);

  React.useEffect(() => {
    Object.keys(layer.filters)
      .forEach(filterId => {
        const {
          type,
          wrapper,
          Component
        } = layer.filters[filterId];
        switch (type) {
          case "select": {
            if (wrapper) {
              layer.filters[filterId].Filter = FilterWrapper(wrapper(MultiLevelSelect));
            }
            else {
              layer.filters[filterId].Filter = FilterWrapper(MultiLevelSelect);
            }
            break;
          }
          default: {
            if (Component) {
              layer.filters[filterId].Filter = FilterWrapper(Component);
            }
            else {
              layer.filters[filterId].Filter = UnknownFilter;
            }
          }
        }
      })
  }, [layer]);

  const [Filters, _setFilters] = React.useState([]);

  const setFilters = React.useCallback(() => {
    _setFilters(
      Object.keys(layer.filters)
        .reduce((a, id) => {
          const {
            Filter,
            isActive = true,
            ...options
          } = layer.filters[id];

          if (Filter && isActive) {
            a.push({ Filter, id, ...options });
          };
          return a;
        }, [])
    );
  }, [layer.filters]);

  React.useEffect(() => {
    setFilters();
  }, [setFilters]);

  React.useEffect(() => {
    if (filterUpdate) {
      const { filterId, prevValue, value } = filterUpdate;
      for (const id in layer.filters) {
        if (id === filterId) {
          layer.filters[filterId].prevValue = prevValue;
          layer.filters[filterId].value = value;
        }
      }
      if (typeof layer.onFilterChange === "function") {
        layer.onFilterChange.call(layer, filterId, value, prevValue);
      }
      setFilters();
    }
  }, [layer, setFilters, filterUpdate]);

  const {
    LayerPanelContainer,
    LayerPanelHeaderContainer,
    LayerPanelFilterContainer
  } = useComponentLibrary();

  const isOpen = Boolean(open && Filters.length);

  return (
    <LayerPanelContainer>
      <LayerPanelHeaderContainer
        toggleOpen={ toggleOpen }
        open={ isOpen }
      >
        <LayerPanelHeader layer={ layer } { ...props }
          MapActions={ MapActions }
          open={ isOpen }
        >
          { get(layer, "toolbar", []).map((tool, i) => (
              <div key={ i } className={ i === 0 ? "" : "" }>
                <LayerPanelTool { ...props }
                  MapActions={ MapActions }
                  layer={ layer }
                  tool={ tool }/>
              </div>
            ))
          }
        </LayerPanelHeader>
      </LayerPanelHeaderContainer>
      <div className={ `${ isOpen ? "block" : "h-0 overflow-hidden invisible" }` }>
        { Filters.map(({ Filter, id, name, ...options }, i) => (
            <LayerPanelFilterContainer key={ id } name={ name }
              lastFilter={ i === Filters.length - 1 }
            >
              <Filter { ...options } { ...props }
                id={ id } layer={ layer }
                MapActions={ MapActions }/>
            </LayerPanelFilterContainer>
          ))
        }
      </div>
    </LayerPanelContainer>
  )
}

const LayersPanel = allProps => {
  const {
    activeLayers,
    inactiveLayers,
    MapActions,
    filterUpdate,
    mapName,
    ...props
  } = allProps;

  const theme = useTheme();

  return (
    <>
      { !mapName ? null :
        <div className={ `mb-1 font-bold text-lg text-center ${ theme.bg } sticky top-0`} >
          { mapName }
        </div>
      }
      { !inactiveLayers.length ? null :
        <MultiLevelSelect isDropdown
          options={ inactiveLayers }
          onChange={ MapActions.activateLayer }
          displayAccessor={ o => o.name }
          valueAccessor={ o => o.id }
        >
          <div className={ `border ${ theme.border } rounded px-2 py-1 mb-1` }>
            Select a layer...
          </div>
        </MultiLevelSelect>
      }
      <div className="grid grid-cols-1 gap-1">
        { activeLayers.map(l => (
            <LayerPanel key={ l.id } layer={ l } { ...props }
              MapActions={ MapActions }
              filterUpdate={ filterUpdate.layerId === l.id ? filterUpdate : null }/>
          ))
        }
      </div>
    </>
  )
}
export default LayersPanel;

const checkDefaultTools = tool => {
  if (typeof tool !== "string") return tool;

  switch (tool) {
    case "toggle-visibility":
      return {
        tooltip: "Toogle Visibility",
        Icon: ({ isVisible }) => <span className={ `fa fa-eye${ !isVisible ? "-slash" : "" }` }/>,
        action: ({ toggleLayerVisibility }, layer) => toggleLayerVisibility(layer.id),
      };
    default:
      return {
        tooltip: `Unknown Tool "${tool}"`,
        Icon: "fa fa-frown",
        action: null,
      };
  }
};

const LayerPanelTool = ({ tool, MapActions, layer, layerVisibility, ...props }) => {
  const Tool = React.useMemo(() => {
    return checkDefaultTools(tool);
  }, [tool]);

  const Icon = React.useMemo(() => {
    return typeof Tool.Icon === "function" ? Tool.Icon :
      () =>  <span className={ Tool.Icon }/>;
  }, [Tool]);

  const action = React.useCallback(e => {
    e.stopPropagation();
    if (typeof Tool.action === "function") {
      Tool.action(MapActions, layer);
    }
  }, [Tool, MapActions, layer]);

  const { LayerPanelHeaderButton } = useComponentLibrary();

  return (
    <LayerPanelHeaderButton onClick={ action }>
      <Icon layer={ layer } isVisible={ get(layerVisibility, layer.id) }/>
    </LayerPanelHeaderButton>
  )
}
