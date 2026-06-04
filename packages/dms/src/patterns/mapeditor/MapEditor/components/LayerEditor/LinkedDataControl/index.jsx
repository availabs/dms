import React, { useContext, useMemo } from "react";
import { get, set, unset } from "lodash-es";
import { SymbologyContext } from "../../../";
import { normalizeLayerJoinConfig } from "../../../stateUtils";
import JoinSetup from "./JoinSetup";
import JoinQueryBuilder from "./JoinQueryBuilder";

function LinkedDataControl() {
  const { state, setState } = useContext(SymbologyContext);

  const activeLayerId = state?.symbology?.activeLayer;
  const joinPath = `symbology.layers[${activeLayerId}].join`;
  const legacyJoinPath = `symbology.layers[${activeLayerId}]['linked-data']`;

  const currentConfig = useMemo(
    () => normalizeLayerJoinConfig(get(state, joinPath, {}), get(state, legacyJoinPath, {})),
    [joinPath, legacyJoinPath, state]
  );

  const setLinkedDataConfig = (updater) => {
    setState((draft) => {
      const nextConfig = normalizeLayerJoinConfig(get(draft, joinPath, {}), get(draft, legacyJoinPath, {}));
      updater(nextConfig);
      set(draft, joinPath, nextConfig);
      unset(draft, legacyJoinPath);
    });
  };

  return (
    <div className="mx-4 mt-3 border-t border-slate-200 pt-3">
      <div className="w-full text-slate-500 text-[14px] tracking-wide">
        Join
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="text-sm text-slate-700">Enable tile join</div>
        <input
          type="checkbox"
          checked={currentConfig.enabled}
          onChange={(e) =>
            setLinkedDataConfig((nextConfig) => {
              nextConfig.enabled = e.target.checked;
            })
          }
        />
      </div>

      {currentConfig.enabled ? (
        <div className="mt-3 max-h-[calc(100vh_-_430px)] space-y-3 overflow-y-auto pr-1 pb-4">
          <JoinSetup config={currentConfig} setLinkedDataConfig={setLinkedDataConfig} />
          <JoinQueryBuilder config={currentConfig} setLinkedDataConfig={setLinkedDataConfig} />
        </div>
      ) : null}
    </div>
  );
}

export default LinkedDataControl;
