import React, {useMemo, useContext} from 'react'
import { get } from 'lodash-es'
import { ThemeContext } from '../../../../../../../../ui/useTheme'
import { gisCreateTheme } from '../gisCreate.theme'

const buttonStates = {
    AWAITING: {
      text: 'Publish',
      color: 'bg-blue-500'
    },
    IN_PROGRESS: {
      text: "Publishing...",
      color: "bg-amber-500"
    },
    PUBLISHED: {
       text: "Publishing...",
       color: "bg-amber-500"
    },
    ERROR : {
       text: "Error...",
       color: "bg-red-500"
    }
}

export default function PublishButton({ state, dispatch }) {
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };

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
    color: publishButtonBgColor } = useMemo(()=>
      get(buttonStates, publishStatus, buttonStates['AWAITING'])
  , [publishStatus])

  // state colour from the theme (publishBtn* keys — they existed but were never read; the legacy
  // values equal the old hardcoded buttonStates colours)
  const publishBtnStateClass = {
    AWAITING: t.publishBtnAwaiting,
    IN_PROGRESS: t.publishBtnInProgress,
    PUBLISHED: t.publishBtnInProgress,
    ERROR: t.publishBtnError,
  }[publishStatus] ?? publishButtonBgColor;

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
        <button
          className={`${t.publishBtn} ${publishBtnStateClass}`}
          //disabled={publishStatus'AWAITING'}
          onClick={() => {
            console.log('onClick publush', publishStatus)
            if (publishStatus === "AWAITING" || publishStatus === "ERROR" ) {
              publish();
            }
          }}
        >
          {publishButtonText}
        </button>
        {t.publishHint ? <p className={t.publishHint}>Creates the source, loads the layer, then opens its upload status.</p> : null}
      </div>
      <PublishErrorMessage state={state} />
    </div>
  );
}

function PublishErrorMessage({state}) {
  // `t` was never defined here — any publish error threw a ReferenceError instead of showing
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };

  const {
    etlContextId,
    publishStatus,
    publishErrMsg
  } = state

  if (publishStatus !== "ERROR") {
    return "";
  }

  // v6: themed cells; legacyInlineStyles keeps the original inline style={} objects
  const L = !!t.legacyInlineStyles;
  return (
    <table
      className={t.publishErrorTable}
      style={L ? {
        margin: "40px auto",
        textAlign: "center",
        border: "1px solid",
        borderColor: "back",
      } : undefined}
    >
      <thead
        style={L ? {
          color: "black",
          backgroundColor: "red",
          fontWeight: "bolder",
          textAlign: "center",
          marginTop: "40px",
          fontSize: "20px",
          border: "1px solid",
          borderColor: "black",
        } : undefined}
      >
        <tr>
          <th className={t.errTh || undefined} style={L ? { border: "1px solid", borderColor: "black" } : undefined}>
            {" "}
            Publish Error
          </th>
          <th className={t.errTh || undefined} style={L ? { border: "1px solid", borderColor: "black" } : undefined}>
            {" "}
            ETL Context ID
          </th>
        </tr>
      </thead>
      <tbody style={L ? { border: "1px solid" } : undefined}>
        <tr style={L ? { border: "1px solid" } : undefined}>
          <td
            className={t.errTd || undefined}
            style={L ? {
              border: "1px solid",
              padding: "10px",
              backgroundColor: "white",
              color: "darkred",
            } : undefined}
          >
            {publishErrMsg}
          </td>
          <td className={t.errTdCtx || undefined} style={L ? { border: "1px solid", backgroundColor: "white" } : undefined}>
            {etlContextId}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
