import React, {useMemo, useContext} from 'react'
import { get } from 'lodash-es'
import { ThemeContext } from '../../../../../../../../ui/useTheme'
import { gisCreateTheme } from '../gisCreate.theme'
import GisErrorTable from '../ErrorTable'

// the button's text and UI.Button role per publish state (2026-10-15: was a raw <button> + publishBtn* colour keys)
const buttonStates = {
    AWAITING: { text: 'Publish', activeStyle: 'primary' },
    IN_PROGRESS: { text: "Publishing...", activeStyle: 'primary', busy: true },
    PUBLISHED: { text: "Publishing...", activeStyle: 'primary', busy: true },
    ERROR: { text: "Error...", activeStyle: 'danger' },
}

export default function PublishButton({ state, dispatch }) {
  const { theme, UI } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  const { Button } = UI || {};

  const {
    layerName,
    publishStatus,
    uploadErrMsg,
    lyrAnlysErrMsg,
    tableDescriptor,
    damaSourceName,
    damaSourceId,
    damaServerPath,
    etlContextId,
    gisUploadId,
    userId,
    email,
    customViewAttributes,
    sourceType,
    mbtilesOptions,
    useMbTiles
  } = state

// console.log("SOURCE TYPE:", sourceType)

  const {
    text: publishButtonText,
    activeStyle: publishButtonStyle,
    busy: publishBusy } = useMemo(()=>
      get(buttonStates, publishStatus, buttonStates['AWAITING'])
  , [publishStatus])

  if (!layerName || uploadErrMsg || lyrAnlysErrMsg || !tableDescriptor) {
    return "";
  }

  const publish = () => {
    const runPublish = async () => {
      try {
        dispatch({type: 'update', payload: { publishStatus : 'IN_PROGRESS' }})

        if (mbtilesOptions && mbtilesOptions?.preserveColumns && (Object.keys(mbtilesOptions?.preserveColumns || {}) || []).length) {
          mbtilesOptions.preserveColumns = (Object.keys(mbtilesOptions?.preserveColumns || {}) || []).filter(key => mbtilesOptions?.preserveColumns[key] === true);
        } else {
          mbtilesOptions.preserveColumns = [];
        }

        const publishData = {
          source_id: damaSourceId || null,
          source_values: {
            name: damaSourceName,
            type: sourceType || 'gis_dataset'
          },
          parent_context_id: etlContextId,
          user_id: userId,
          email: email,
          tableDescriptor,
          gisUploadId,
          layerName,
          etlContextId,
          customViewAttributes,
          mbtilesOptions,
          useMbTiles
        };

        const sourceTypeURL = sourceType === "csv_dataset" ? "csv-dataset" : "gis-dataset";

        const res = await fetch(`${state.damaServerPath}/${ sourceTypeURL }/publish`,
        {
          method: "POST",
          body: JSON.stringify(publishData),
          headers: {
            "Content-Type": "application/json",
          },
        });

        const publishFinalEvent = await res.json();
        console.log('publishFinalEvent', publishFinalEvent)

        const { etl_context_id, source_id } = publishFinalEvent

        dispatch({ type: 'update', payload: { publishStatus : 'PUBLISHED',  damaSourceId: source_id, etlContextId: etl_context_id }});
      } catch (err) {
        dispatch({
          type: 'update',
          payload: {
            publishStatus : 'ERROR',
            publishErrMsg: err.message
          }
        });
        console.error("==>", err);
      }
    }
    runPublish()
  }

  return (
    <div>
      <div className={t.publishRow || undefined}>
        <Button
          activeStyle={publishButtonStyle}
          disabled={!!publishBusy}
          onClick={() => {
            console.log('onClick publush', publishStatus)
            if (publishStatus === "AWAITING" || publishStatus === "ERROR" ) {
              publish();
            }
          }}
        >
          {publishButtonText}
        </Button>
        {t.publishHint ? <p className={t.publishHint}>Creates the source, loads the layer, then opens its upload status.</p> : null}
      </div>
      <PublishErrorMessage state={state} />
    </div>
  );
}

function PublishErrorMessage({state}) {
  const {
    etlContextId,
    publishStatus,
    publishErrMsg
  } = state

  if (publishStatus !== "ERROR") {
    return "";
  }

  return <GisErrorTable title="Publish Error" message={publishErrMsg} etlContextId={etlContextId} />;
}
