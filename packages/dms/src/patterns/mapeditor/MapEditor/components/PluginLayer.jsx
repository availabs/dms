import React, { useEffect, useContext, useMemo } from "react"
import { AvlLayer } from "../../../../ui/components/map"
import { get } from 'lodash-es'
import { SymbologyContext } from "../"
import {PluginLibrary} from "../"

//CURRENTLY
//pluginData path is appended from within SettingsPanel

/**
 * Developer expose to `typeConfig`-like json
 */

//layer-select control (Symbology Creator) (Internal Panel)

//performence measure (speed, lottr, tttr, etc.) (External Panel) (Dev hard-code)
//"second" selection (percentile, amp/pmp) (External Panel) (Dev hard-code)


const NO_PLUGIN = () => null;
let didRegister = false;
const PluginLayerRender = ({
  maplibreMap,
  layer,
  layerProps,
  allLayerProps
}) => {
  // const mctx = React.useContext(MapContext);
  // const sctx = React.useContext(SymbologyContext);
  // const ctx = mctx?.falcor ? mctx : sctx;
  const { state, setState } = React.useContext(SymbologyContext);

  let layerPluginDataPath = '';
  //console.log("state in plugin layer::", state)

  if(sctx) {
    layerPluginDataPath =`symbology.pluginData['${layer.id}']`
  } else {
    const symbName = Object.keys(state.symbologies)[0];
    layerPluginDataPath  = `symbologies['${symbName}'].symbology.pluginData['${layer.id}']`;
        // console.log({layerPluginDataPath, symbName, layerId: layer.id})
  }

  const layerPluginData = get(state, layerPluginDataPath);

  const plugin = useMemo(() => {
    return PluginLibrary[layer.id]
  }, [layer.id]);
  // ------------
  // On Load Unload
  // ---------------
  useEffect(() => {
    if(!didRegister) {
      plugin?.mapRegister(maplibreMap, state, setState);
      didRegister = true;
    }

    return () => {
      plugin?.cleanup(maplibreMap, state, setState)
    }
  }, []);

  useEffect(() => {
    //e.g. Symbology layer selected (internal)
    //e.g. pm3 measure selected (external)
    if(!plugin?.dataUpdate) {
      console.error("no data update provided for plugin");
    } else if(!layerPluginData) {
      console.warn(`no pluginData found for layer:: ${layer.id}. cannot perform dataUpdate`)
    } else {
      plugin.dataUpdate(maplibreMap, state, setState);
    }
  }, [layerPluginData]);

  const RenderComp = plugin?.comp || NO_PLUGIN;

  return (
     <RenderComp state={state} setState={setState} map={maplibreMap}/>
   );
}



class PluginLayer extends AvlLayer {
  RenderComponent = PluginLayerRender;
}

export default PluginLayer;
