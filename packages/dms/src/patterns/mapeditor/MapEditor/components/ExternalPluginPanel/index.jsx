import React, { useContext, Fragment, useRef } from "react";
import { SymbologyContext, PluginLibrary } from "../../";
// import { MapContext } from "../dms/map/MapComponent";
// import { DamaContext } from "../../../../../../store"
import { Menu, Transition, Tab, Dialog } from "@headlessui/react";
import { wrapperTypes } from '../PluginControls/PluginControlWrappers'
import { zip } from "lodash";

//TODO -- this MAYBE needs some combination of these changes:
//Use MapContext if available (otherwise, use SymbologyContext)
//TODO -- this could break mapEditor plugin stuff
function ExternalPluginPanel() {
  // const mctx = React.useContext(MapContext);
  // const sctx = React.useContext(SymbologyContext);
  // const ctx = mctx?.falcor ? mctx : sctx;
  // console.log({MapContext, SymbologyContext})
  // console.log("external panel ctx::", ctx)
  const { state, setState } = React.useContext(SymbologyContext)

  let tabs;
  
  if(mctx) {
    tabs = Object.values((state.symbologies || {})).map(symb => Object.keys((symb?.symbology?.plugins || {}))).flat();
  } else {
    tabs = Object.keys(state.symbology.plugins);
  }

  //TODO -- based on whether or not we have `MapContext` vs `SymbologyContext`
  //dynamically figure out tab names
  //dyanmically set symbology path for controls
  //TODO make sure this works still in map editor
  let pathBase = 'symbology.pluginData'
  if(mctx) { 
    const symbName = Object.keys(state.symbologies)[0];
    pathBase = `symbologies['${symbName}'].symbology.pluginData`;
  }

  //filter tabs depending on if they have any controls
  tabs = tabs.filter(pluginName => 
     PluginLibrary[pluginName]?.externalPanel({state, setState, pathBase: `${pathBase}['${pluginName}']`})?.length
  )

  return (
    <div className="p-4">
      <div className="bg-white/95 w-[340px] rounded-lg drop-shadow-lg pointer-events-auto max-h-[calc(100vh_-_111px)] scroll-xs">
        <Tab.Group>
          <Tab.List>
            {tabs.map(tabName => (
              <Tab  key={tabName} as={Fragment}>
                {({ selected }) => (
                  <button
                    className={`
                      ${selected ? 
                        'text-slate-600 border-b font-medium border-slate-600' : 
                        'text-slate-400'} mx-1 text-sm p-2 cursor-pointer
                    `}
                  >
                    {tabName}
                  </button>
                )}
              </Tab>
            ))}
          </Tab.List>
          <Tab.Panels>
            {tabs.map((pluginName) => {
              const externalControls = PluginLibrary[pluginName]?.externalPanel({state, setState, pathBase: `${pathBase}['${pluginName}']`});
              return (
                <Tab.Panel key={`plugin_settings_${pluginName}`}>
                  {externalControls?.map((control, i) => {
                    let ControlWrapper =
                      wrapperTypes[control.type] || wrapperTypes["inline"];
                    return (
                      <div className="flex flex-wrap h-fit p-1" key={i}>
                        <ControlWrapper
                          label={control.label}
                          controls={control.controls.map(control => {
                            return ({
                            ...control,
                            path: `${pathBase}['${pluginName}']${control.path}`
                          })}
                        )}
                        />
                      </div>
                    );
                  })}
                </Tab.Panel>
              );
            })}
          </Tab.Panels>
        </Tab.Group>
      </div>
    </div>
  );
}

export default ExternalPluginPanel;
