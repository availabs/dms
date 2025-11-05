import React, { useEffect, useMemo } from "react";
import { get } from "lodash/get";
import { DamaContext } from "~/pages/DataManager/store";

export default function Upload({ ctxId }) {
  const { pgEnv, falcor, falcorCache } = React.useContext(DamaContext);

  useEffect(() => {
    async function getCtxById() {
      await falcor.get(["dama", pgEnv, "etlContexts", "byEtlContextId", ctxId]);
    }
    getCtxById();
  }, [falcor, pgEnv, ctxId]);

  const ctx = useMemo(() => {
    return get(falcorCache, [
      "dama",
      pgEnv,
      "etlContexts",
      "byEtlContextId",
      ctxId,
      "value",
    ]);
  }, [falcorCache]);

  return (
    <div className="w-full p-4 bg-white shadow mb-4">
      {ctx && ctx?.events && ctx?.events?.length ? (
        <>
          <div className="py-4 sm:py-2 mt-2 sm:grid sm:grid-cols-5 sm:gap-4 sm:px-6 border-b-2">
            {["Id", "Event Type", "Timestamp"].map((key) => (
              <dt key={key} className="text-sm font-medium text-gray-600">
                {key}
              </dt>
            ))}
          </div>
          <dl className="sm:divide-y sm:divide-gray-200 odd:bg-white even:bg-slate-50">
            {(ctx?.events || []).map((d, i) => (
              <div
                key={`${i}_0`}
                className="py-4 sm:py-5 sm:grid sm:grid-cols-5 sm:gap-4 sm:px-6 cursor-pointer hover:bg-slate-200"
              >
                <dd
                  key={`${i}_1`}
                  className="mt-1 text-sm text-gray-900 sm:mt-0 align-middle"
                >
                  {d?.event_id}
                </dd>
                <dd
                  key={`${i}_2`}
                  className="mt-1 text-sm text-gray-900 sm:mt-0 align-middle"
                >
                  {d?.type?.split(":").pop()}
                </dd>

                <dd
                  key={`${i}_3`}
                  className="mt-1 text-sm text-gray-900 sm:mt-0 align-middle"
                >
                  {d._created_timestamp}
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <div className="text-center">{"No Events found"}</div>
      )}
    </div>
  );
}
