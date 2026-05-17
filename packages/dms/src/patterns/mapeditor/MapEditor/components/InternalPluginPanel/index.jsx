import React, { useContext, useState } from "react";
import { SymbologyContext, PluginLibrary } from "../..";

import { wrapperTypes } from '../PluginControls/PluginControlWrappers'

function InternalPluginPanel() {
  const { state, setState } = React.useContext(SymbologyContext);
  const [tabIdx, setTabIdx] = useState(0);
  const tabs = Object.keys(state.symbology.plugins)
  const safeIdx = Math.min(tabIdx, tabs.length - 1);
  const activePluginName = tabs[safeIdx];

  const activeControls = (() => {
    if (!activePluginName) return [];
    const internalControls = PluginLibrary[activePluginName]?.internalPanel({state, setState}) || [];
    const displayDefaultLegendControl = {
      label: "Display default legend",
      controls: [
        {
          type: 'toggle',
          path: `['default-legend']`,
          params: { default : true },
        },
      ],
    };
    return [displayDefaultLegendControl, ...internalControls];
  })();

  return (
    <div className="p-4">
      <div className="bg-white/95 w-[312px] rounded-lg drop-shadow-lg pointer-events-auto min-h-[400px] max-h-[calc(100vh_-_111px)] scroll-xs">
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
              <div className="flex flex-wrap p-1" key={i}>
                <ControlWrapper
                  label={control.label}
                  controls={control?.controls?.map(control => ({
                    ...control,
                    path: `symbology.pluginData['${activePluginName}']${control.path}`
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

export default InternalPluginPanel;
