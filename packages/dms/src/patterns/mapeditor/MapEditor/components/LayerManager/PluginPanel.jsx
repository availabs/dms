import React, {
  useContext,
  useMemo,
  useCallback,
  Fragment,
  useRef,
} from "react";
import { PluginSelector } from "./PluginSelector";
import { SymbologyContext, PluginLibrary } from "../../";
import get from "lodash/get";
import omit from "lodash/omit";
function PluginPanel(props) {
  const { state, setState } = React.useContext(SymbologyContext);
  const layers = useMemo(() => state.symbology?.layers || {}, [state]);
  //console.log('layers', layers)
  //console.log("PluginPanel (enable/disable plugins) state", state);
  return (
    <>
      {/* ------Layer Pane ----------- */}
      <div className="min-h-20 relative p-1">
        <div>
          Add plugin:
          <PluginSelector state={state} setState={setState} />
        </div>
        <div>
          Active Plugins
          {state?.symbology?.plugins &&
            Object.keys(state?.symbology?.plugins).map((d) => {
              return (
                <div key={`plugin_${d}`}>
                  <div className="flex justify-between">
                    <div className="p-1"><b>{d}</b></div>
                    <div
                      onClick={() => {
                        console.log("remove clicked", d);
                        setState((draft) => {
                          draft.symbology.plugins = omit(draft.symbology.plugins, d);
                          draft.symbology.pluginData = omit(draft.symbology.pluginData, d);
                        });
                      }}
                    >
                      X
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}

export default PluginPanel;
