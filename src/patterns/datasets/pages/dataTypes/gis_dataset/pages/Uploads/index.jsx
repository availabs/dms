import React, { useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { get } from "lodash/get";
import {  } from "~/modules/avl-components/src";
// import { withAuth } from "~/modules/avl-components/src";

import { DamaContext } from "~/pages/DataManager/store";

import ListUploads from "./list";
import Upload from "./view";

const UploadsPage = ({ source }) => {
  const { pgEnv, falcor, falcorCache, user } = React.useContext(DamaContext);
  const { viewId, page } = useParams();

  let { source_id: sourceId } = source || {};

  if (page === "uploads" && viewId) {
    return <Upload ctxId={viewId} />;
  }

  useEffect(() => {
    async function getCtxs() {
      sourceId = Number(sourceId);

      const lengthPath = [
        "dama",
        pgEnv,
        "etlContextsbyDamaSourceId",
        [sourceId],
        "length",
      ];
      const resp = await falcor.get(lengthPath);

      await falcor.get([
        "dama",
        pgEnv,
        "etlContextsbyDamaSourceId",
        [sourceId],
        "byIndex",
        { from: 0, to: get(resp.json, lengthPath, 0) - 1 },
        [
          "etl_context_id",
          "_created_timestamp",
          "etl_status",
          "_modified_timestamp",
          "initial_event_id",
          "latest_event_id",
        ],
      ]);
    }
    getCtxs();
  }, [falcor, pgEnv, sourceId]);

  const ctxs = useMemo(() => {
    let ref = get(falcorCache, [
      "dama",
      pgEnv,
      "etlContextsbyDamaSourceId",
      [sourceId],
      "byIndex",
    ]);
    return (
      ref &&
      Object.values(ref)
        .map((r) => get(falcorCache, r.value, {}))
        .filter((f) => Object.keys(f).length > 0)
    );
  }, [falcorCache, sourceId]);

  return (
    <>
      <div className="flex">
        <div className="flex-1 pl-3 pr-4 py-2">Upload Views</div>
      </div>
      <ListUploads uploads={ctxs} sourceId={sourceId}/>
    </>
  );
};

export default UploadsPage;
