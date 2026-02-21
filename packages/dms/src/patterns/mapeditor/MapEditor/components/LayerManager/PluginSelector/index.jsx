import { useState, useMemo, useContext } from "react";
import { useNavigate } from "react-router";
import { MapEditorContext } from "../../../../context";
import { PluginLibrary } from "../../../";
import { INITIAL_PLUGIN_DATA_STATE } from '../../../';


export const PluginSelector = ({ state, setState }) => {
  const { baseUrl } = useContext(MapEditorContext);
  const navigate = useNavigate();
  //console.log("PluginSelector",state);
  return (
    <select
      className="w-full py-2 bg-transparent"
      value={""}
      onChange={(e) => {
        console.log("plugin selected::", e);
        //register plugin
        setState((draft) => {
          if (!draft.symbology.plugins) {
            draft.symbology.plugins = {};
          }
          console.log("add plug library value::",PluginLibrary[e.target.value])
          draft.symbology.plugins[e.target.value] = PluginLibrary[e.target.value];
          if(!draft.symbology.pluginData){
            draft.symbology.pluginData = {}
          }
          draft.symbology.pluginData[e.target.value] = INITIAL_PLUGIN_DATA_STATE;
        });
      }}
    >
      <option key={-1} value={""}></option>
      {(Object.keys(PluginLibrary) || [])
        .filter(
          (pluginName) =>
            !(Object.keys(state?.symbology?.plugins || {}) || []).includes(pluginName)
        )
        .map((pluginName, i) => (
          <option key={i} value={pluginName}>
            {pluginName}
          </option>
        ))}
    </select>
  );
};
