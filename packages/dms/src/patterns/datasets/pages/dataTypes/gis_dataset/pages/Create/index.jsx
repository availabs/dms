import React, { useReducer, useEffect } from "react";
import { useNavigate } from "react-router";

import { DatasetsContext } from "../../../../../context";
import { getExternalEnv } from "../../../../../utils/datasources";
import { reducer } from "./components/reducer";

import UploadFileComp from "./uploadFile";
import SelectLayerComp from "./selectLayer";
import SchemaEditorComp from "./schemaEditor";
import PublishComp from "./publish";
import CreateStep from "../../../../../components/CreateStep";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import { createPageTheme } from "../../../../createPage.theme";
import { gisCreateTheme } from "./gisCreate.theme";

const BlankComponent = () => <></>;

export default function UploadGisDataset({
  source = {},
  user = {},
  dataType = "gis_dataset",
  CustomAttributes = BlankComponent,
  tippecanoeOptions = {},
  customRules = {},
  databaseColumnNames = null,
  useMbTiles = false
}) {
  const { name: damaSourceName, source_id: sourceId, type, uploadedFile, gisUploadId, analysisContextId } = source;
  // dms-server hosts the DAMA upload endpoints under /dama-admin/ on the main
  // API host now. No separate DAMA_HOST.
  const { datasources, baseUrl, falcor, user:ctxUser, API_HOST } = React.useContext(DatasetsContext);
  const pgEnv = getExternalEnv(datasources);
  const navigate = useNavigate()
  const { theme } = React.useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  // v6: each part is a numbered step that appears once it's relevant; pre-v6 (no step chrome)
  // renders every part, as before
  const stepped = !!{ ...createPageTheme, ...(theme?.datasets?.createPage || {}) }.step;
  const [state, dispatch] = useReducer(reducer, {
    damaSourceId: sourceId,
    databaseColumnNames: databaseColumnNames ?
      databaseColumnNames :
      (source?.metadata?.columns || source?.metadata || []).map(d => d.name),
    damaSourceName: damaSourceName,
    userId: user?.id ?? ctxUser.id,
    email: user?.email ?? ctxUser.email,
    etlContextId: null,
    analysisContextId: analysisContextId || null,
    customViewAttributes: { years: [] },
    dataType: dataType,
    // maxSeenEventId: null,
    damaServerPath: `${API_HOST}/dama-admin/${pgEnv}`,

    // uploadFile state
    gisUploadId: gisUploadId || null,
    fileUploadStatus: null,
    uploadedFile: uploadedFile || null,
    uploadErrMsg: null,
    processPolling: false,
    processPollingInterval: null,
    polling: false,
    pollingInterval: null,

    // selectLayer state
    layerNames: null,
    layerName: null,
    lyrAnlysErrMsg: null,
    layerAnalysis: null,
    layerAnalysisReady: false,
    analysisPolling: false,
    analysisPollingInterval: null,

    // schemaEditor state

    tableDescriptor: null,
    mbtilesOptions: { preserveColumns: {}, ...tippecanoeOptions },
    useMbTiles,
    // publish state
    publishStatus: "AWAITING",
    publishErrMsg: null,

    // source
    sourceType: type,
  });

  useEffect(() => {
    dispatch({ type: "update", payload: { damaSourceName } });
  }, [damaSourceName]);

  useEffect(() => {
    dispatch({ type: "update", payload: { sourceType: type } });
  }, [type]);

  useEffect(() => {
    if (state.publishStatus === "PUBLISHED") {
      if (state.damaSourceId && state.etlContextId) {
        falcor.invalidate([
          "dama",
          pgEnv,
          "sources",
          "byId",
          state.damaSourceId,
          "views",
          "length",
        ]);
      } else {
        falcor.invalidate(["dama", pgEnv, "sources", "length"]);
      }
      console.log('publish done', state, state.damaSourceId)
      navigate(`${baseUrl}/source/${state.damaSourceId}/uploads/${state.etlContextId}`);
    }
  }, [state.publishStatus, state.damaSourceId, pgEnv, navigate]);

  useEffect(() => {
    // on page load get etl context
    // TODO :: probably want to move this to on file upload
    // currently it runs every refresh leaving orphaned contextIds

    async function getContextId () {
      const newEtlCtxRes = await fetch(
        `${state.damaServerPath}/etl/new-context-id`
      );
      const newEtlCtxId = +(await newEtlCtxRes.text());
      dispatch({ type: "update", payload: { etlContextId: newEtlCtxId } });
    };

    if(!state.analysisContextId) {
      getContextId()
    }
  }, [pgEnv, state.damaServerPath]);

  if (!sourceId && !damaSourceName) {
    return <div className={t.nameHint}> Please enter a datasource name.</div>;
  }

  const canUpload = Object.keys(customRules)?.reduce((out, ruleKey) => {
    if (customRules[ruleKey](state) !== "canUpload") {
      out = customRules[ruleKey](state);
    }
    return out;
  }, "canUpload");

  const uploadComp = canUpload === "canUpload" ? (
    <UploadFileComp state={state} dispatch={dispatch} />
  ) : (
    canUpload
  );

  if (!stepped) {
    return (
      <div>
        <CustomAttributes state={state} dispatch={dispatch} />
        {uploadComp}
        <SelectLayerComp state={state} dispatch={dispatch} />
        <SchemaEditorComp state={state} dispatch={dispatch} />
        <PublishComp state={state} dispatch={dispatch} />
      </div>
    );
  }

  const layersReady = !!state.layerNames;
  const fieldsReady = !!state.layerName;
  const publishReady = !!state.tableDescriptor;
  return (
    <>
      <CustomAttributes state={state} dispatch={dispatch} />
      <CreateStep n={1} title="Upload file" note="a zipped shapefile, GeoPackage, GeoJSON or CSV"
                  state={layersReady ? 'done' : 'active'}>
        {uploadComp}
      </CreateStep>
      {/* every part stays mounted — select-layer / schema-editor run the polling and fetches that
          move the flow forward; a step is just collapsed until it's relevant */}
      <CreateStep n={2} title="Select layer" state={publishReady ? 'done' : layersReady ? 'active' : 'todo'} collapsed={!layersReady}>
        <SelectLayerComp state={state} dispatch={dispatch} />
      </CreateStep>
      <CreateStep n={3} title="Map fields" note="field names mappings" state={fieldsReady ? 'active' : 'todo'} collapsed={!fieldsReady}>
        <SchemaEditorComp state={state} dispatch={dispatch} />
      </CreateStep>
      <CreateStep n={4} title="Publish" state={publishReady ? 'active' : 'todo'} collapsed={!publishReady}>
        <PublishComp state={state} dispatch={dispatch} />
      </CreateStep>
    </>
  );
}
