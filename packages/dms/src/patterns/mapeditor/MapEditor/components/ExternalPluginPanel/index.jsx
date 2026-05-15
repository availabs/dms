import React, { useContext, useState } from "react";
import { SymbologyContext, PluginLibrary } from "../../";
import { MapContext } from "../../../../page/components/sections/components/ComponentRegistry/map"
import { wrapperTypes } from '../PluginControls/PluginControlWrappers'
import { zip } from "lodash-es"

//TODO -- this MAYBE needs some combination of these changes:
//Use MapContext if available (otherwise, use SymbologyContext)
//TODO -- this could break mapEditor plugin stuff
function ExternalPluginPanel() {
  const mctx = React.useContext(MapContext);
  const sctx = React.useContext(SymbologyContext);
  const ctx = mctx?.falcor ? mctx : sctx;
  const { state, setState } = ctx
  const [tabIdx, setTabIdx] = useState(0);

  let tabs;

  if(mctx) {
    tabs = Object.values((state.symbologies || {})).map(symb => Object.keys((symb?.symbology?.plugins || {}))).flat();
  } else {
    tabs = Object.keys(state.symbology.plugins);
  }

  let pathBase = 'symbology.pluginData'
  if(mctx) {
    const symbName = Object.keys(state.symbologies)[0];
    pathBase = `symbologies['${symbName}'].symbology.pluginData`;
  }

  //filter tabs depending on if they have any controls
  tabs = tabs.filter(pluginName =>
     PluginLibrary[pluginName]?.externalPanel({state, setState, pathBase: `${pathBase}['${pluginName}']`})?.length
  )

  const safeIdx = Math.min(tabIdx, tabs.length - 1);
  const activePluginName = tabs[safeIdx];
  const activeControls = activePluginName
    ? PluginLibrary[activePluginName]?.externalPanel({state, setState, pathBase: `${pathBase}['${activePluginName}']`})
    : [];

  return (
    <div className="p-4">
      <div className="bg-white/95 w-[340px] rounded-lg drop-shadow-lg pointer-events-auto max-h-[calc(100vh_-_111px)] scroll-xs">
        <div role="tablist">
          {tabs.map((tabName, i) => (
            <button
              key={tabName}
              type="button"
              role="tab"
              aria-selected={i === safeIdx}
              onClick={() => setTabIdx(i)}
              className={`${i === safeIdx ?
                'text-slate-600 border-b font-medium border-slate-600' :
                'text-slate-400'} mx-1 text-sm p-2 cursor-pointer`}
            >
              {tabName}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {activeControls?.map((control, i) => {
            let ControlWrapper = wrapperTypes[control.type] || wrapperTypes["inline"];
            return (
              <div className="flex flex-wrap h-fit p-1" key={i}>
                <ControlWrapper
                  label={control.label}
                  controls={control.controls.map(control => ({
                    ...control,
                    path: `${pathBase}['${activePluginName}']${control.path}`
                  }))}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ExternalPluginPanel;
