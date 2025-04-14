import React, {useContext, useEffect, useMemo, useRef} from "react";
import {SymbologySelector} from "./SymbologySelector";
import LegendPanel from "./LegendPanel/LegendPanel";
import { AvlMap } from "~/modules/avl-map-2/src"
import SymbologyViewLayer from './SymbologyViewLayer'
import {PMTilesProtocol} from "./pmtiles";
import {blankStyles, defaultStyles} from "./styles";
import {CMSContext} from "../../../../../siteConfig";
import {isEqual} from "lodash-es";

export const MapContext = React.createContext(undefined);

const Map = ({isEdit, value, onChange}) => {
    const {falcor, falcorCache, pgEnv} = useContext(CMSContext);
    const cachedData = typeof value === 'object' ? value : value && isJson(value) ? JSON.parse(value) : {};
    const [state, setState] = useImmer({
        sourceInfo: {},  // symbology
        display: {}, // display settings
        ...cachedData
    });
    const mounted = useRef(false);

    const isHorizontalLegendActive = Object.values(state.sourceInfo?.symbology?.layers || {}).some(
        (symbLayer) => symbLayer["legend-orientation"] === "horizontal"
    );

    const layers = (state.sourceInfo?.symbology?.layers || {});
    const mapLayers = Object.values(layers).map(layer => new SymbologyViewLayer(layer));
    const { center, zoom } = state.initialBounds ? state.initialBounds : {
        center: [-75.17, 42.85],
        zoom: 6.6
    }
    useEffect(() => {
        async function updateData() {
            onChange && onChange(state)
        }

        if(!isEqual(state, value)) {
            updateData()
        }
    },[state])
    console.log('state', state, layers, mapLayers)
    return (
        <MapContext.Provider value={{state, setState, falcor, falcorCache, pgEnv}}>
            <SymbologySelector state={state} setState={setState} />
            <div id='dama_map_view' className="w-full relative" style={{height: state.display.height}} ref={mounted}>
                <AvlMap
                    layers={ mapLayers }
                    layerProps = { layers }
                    hideLoading={true}
                    showLayerSelect={true}
                    mapOptions={{
                        center: center,
                        zoom: zoom,
                        protocols: [PMTilesProtocol],
                        styles: state.blankBaseMap ? blankStyles : defaultStyles,
                        dragPan: state.zoomPan,
                        scrollZoom: state.zoomPan,
                        dragRotate: state.zoomPan
                    }}
                    leftSidebar={ false }
                    rightSidebar={ false }
                />
                <div className={'absolute inset-0 flex pointer-events-none'}>
                    <div className='flex-1'/>
                    <div className={isHorizontalLegendActive ? 'max-w-[350px]' : 'max-w-[300px]'}><LegendPanel /></div>
                </div>
            </div>
        </MapContext.Provider>
    )
}

const defaultState = {
    display: {},
    sourceInfo: {  }
}

export default {
    "name": 'Map',
    "type": 'Map',
    controls: {},
    "EditComp": Map,
    "ViewComp": Map,
}