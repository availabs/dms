import React, { useEffect } from "react";


import {
  GisDatasetUploadErrorMessage,
  GisDatasetFileMeta,
} from "./components";


export default function UploadGisDataset({ state, dispatch }) {
  const {
    etlContextId,
    userId,
    email,
    damaServerPath,
    polling,
    pollingInterval,
    uploadErrMsg,
    uploadedFile,
    fileUploadStatus,
    damaSourceName,
    dataType
  } = state
  // -- upload file
  const uploadGisDataset = async (file) => {
    try {
      // Prepare upload request 
      const formData = new FormData();
      // https://moleculer.services/docs/0.14/moleculer-web.html#File-upload-aliases
      // text form-data fields must be sent before files fields.
      formData.append("etlContextId", etlContextId);
      formData.append("user_id", userId);
      formData.append("email", email);
      formData.append("name", damaSourceName);
      formData.append("type", dataType)
      formData.append("fileSizeBytes", file.size);
      formData.append("file", file);
      
      dispatch({type: 'update', payload: { polling:true, uploadedFile: file}})
      
      console.log('sending upload')
      const res = await fetch(
        `${damaServerPath}/gis-dataset/upload`,
        { method: "POST", body: formData }
      );
      console.log('sending upload finished ')

      // update state from request
      const resValue = await res.json();
      if (Array.isArray(resValue)) {
        const [{ id }] = resValue;
        dispatch({type: 'update', payload: {polling:false, gisUploadId: id, processPolling: true}})
      } else {
        throw resValue;
      }
    } catch (err) {
      // catch error & reset file so new attempt can be made
      dispatch({
        type: 'update', 
        payload: {polling: false, uploadErrMsg: err?.message, uploadedFile: null}
      })
    }
  }

  // --- Poll Upload Progress  
  useEffect(() => {
    const doPolling = async () => {
      // could add check for maxId
      const url = `${damaServerPath}/events/query?etl_context_id=${etlContextId}&event_id=-1`
      const res = await fetch(url);
      const pollingData = await res.json()
      dispatch({type: 'update', payload: {fileUploadStatus: pollingData[pollingData.length -1] }})
    }
    // -- start polling
    if(polling && !pollingInterval) {
      let id = setInterval( doPolling, 3000)
      dispatch({type:'update', payload: {pollingInterval: id}})
    } 
    // -- stop polling
    else if( pollingInterval && !polling) {
      clearInterval(pollingInterval)
      // run polling one last time in case it never finished
      doPolling()
      dispatch({type:'update', payload: {pollingInterval: null}})
    }
  }, [polling, pollingInterval, damaServerPath, etlContextId, dispatch]);

  if (!etlContextId) {
    return "no context Id no upload";
  }

  if (!uploadedFile) {
    return (
      <>
      <div className="w-full border border-dashed border-gray-300 bg-gray-100">
        <div className="p-4">
          <button>
            <input
              type="file"
              onChange={(e) => uploadGisDataset(e.target.files[0])}
            />
          </button>
        </div>
      </div>
    
      {
        uploadErrMsg ? 
        <GisDatasetUploadErrorMessage
          etlContextId={etlContextId}
          uploadErrMsg={uploadErrMsg}
        /> : ''
      }
      </>
    )
  }

  return (
    <GisDatasetFileMeta
      uploadedFile={uploadedFile}
      fileUploadStatus={fileUploadStatus}
    />
  );
}


