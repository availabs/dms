import React, { useEffect } from "react";

import { GisDatasetLayerDatabaseDbSchemaForm } from "./components";

export default function UpdateGisDatasetLayerDatabaseDbSchema({
  state,
  dispatch,
}) {
  const {
    damaSourceId,
    damaServerPath,
    databaseColumnNames,
    gisUploadId,
    layerName,
    layerAnalysisReady
  } = state;



  useEffect(() => {
    // get the table description of the uploaded dataset
    (async () => {
      // if updating source must wait for database columns
      //console.log('damaSourceId', damaSourceId, databaseColumnNames)
      if (
        !layerAnalysisReady ||
        (damaSourceId && !databaseColumnNames) ||
        !gisUploadId ||
        !layerName
      ) {
        return;
      }

      const tblDscRes = await fetch(
        `${damaServerPath}/staged-geospatial-dataset/${gisUploadId}/${layerName}/tableDescriptor`
      );

      const tblDsc = await tblDscRes.json();

      // if updating source, match to columns to upload columns
      if (damaSourceId) {
        const dbCols = new Set(databaseColumnNames);
        for (const row of tblDsc.columnTypes) {
          if (!dbCols.has(row.col)) {
            row.col = "";
          }
        }
      }

      return dispatch({ type: "update", payload: { tableDescriptor: tblDsc } });
    })();
  }, [
    layerAnalysisReady,
    damaSourceId,
    databaseColumnNames,
    gisUploadId,
    layerName,
    damaServerPath,
    dispatch,
  ]);

  if (damaSourceId && !databaseColumnNames) {
    return "";
  }

  return (
    <GisDatasetLayerDatabaseDbSchemaForm state={state} dispatch={dispatch} />
  );
}
