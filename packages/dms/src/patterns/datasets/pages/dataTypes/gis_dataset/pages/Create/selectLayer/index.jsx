import React, {useEffect} from "react";
import { LayerAnalysisSection } from './components'
import { useLocation } from "react-router";

export default function SelectLayer({state, dispatch}) {
  const location = useLocation();
  const { 
    damaServerPath,
    gisUploadId, 
    uploadedFile, 
    layerNames, 
    layerName,
    userId,
    email,
    etlContextId,
    analysisContextId,
    analysisPolling,
    analysisPollingInterval,
    processPolling,
    processPollingInterval,
    layerAnalysisReady
  } = state
  useEffect(() => {
    // get Layer Names ater file is successfully uploaded
    if (gisUploadId && uploadedFile && !processPolling) {
      try {
        const fetchData = async (gisUploadId) => {
          const url = `${damaServerPath}/gis-dataset/${gisUploadId}/layerNames`;
          const layerNamesRes = await fetch(url);
          const layerNames = await layerNamesRes.json();
          // set all layernames && select first layerName
          dispatch({type: 'update', payload: {layerNames, layerName: layerNames[0]}});
        }
        fetchData(gisUploadId)
      } catch (err) {
        // console.log('got an error', error)
        // console.error(err);
        dispatch({type: 'update', payload: {lyrAnlysErrMsg: err.message}});
      }
    }
  }, [ gisUploadId, uploadedFile, damaServerPath, dispatch, processPolling ]);

  //Kickoff Layer Analysis
  useEffect(() => {
    // when layer is selected get analysis of layer
    if (gisUploadId && layerName) {
      try {
        const fetchData = async (gisUploadId, layerName) => {
          const lyrAnlysRes = await fetch(
            `${damaServerPath}/gis-dataset/${gisUploadId}/${layerName}/layerAnalysis`,
            {
              method: "POST",
              body: JSON.stringify({ user_id: userId, email, parent_context_id:etlContextId }),
              headers: {
                "Content-Type": "application/json",
              },
            }
          );
          const lyrAnlys = await lyrAnlysRes.json();
          if(Object.keys(lyrAnlys).includes('GEODATASET_ANALYSIS_VERSION')) {
            dispatch({type: 'update', payload: { layerAnalysis: lyrAnlys, layerAnalysisReady: true }});
          } else {
            window.history.replaceState(null, "", `${location.pathname}/${lyrAnlys.etl_context_id}`)
            dispatch({ type: 'update', payload: { analysisPolling: true, analysisContextId: lyrAnlys.etl_context_id } })
          }
        }
        fetchData(gisUploadId, layerName)
      } catch (err) {
        dispatch({type: 'update', payload: {lyrAnlysErrMsg: err.message}});
      }
    }
  }, [gisUploadId, layerName, damaServerPath, dispatch]);

  //Poll upload processing progress
  useEffect(() => {
    //HOPEFULLY -- this pull the event we need
    const doPolling = async () => {
      const url = `${damaServerPath}/events/query?etl_context_id=${etlContextId}&event_id=-1`
      const res = await fetch(url);
      const pollingData = await res.json()

      const finalEvent = pollingData.some(
        (pEvent) =>
          pEvent.type === "upload:FINAL"
      );

      if (finalEvent) {
        dispatch({ type: 'update', payload: { processPolling: false } })
      }
      if (!finalEvent) {
        const errorEvent = pollingData.find(
          (pEvent) =>
            (pEvent.type.includes("upload") && pEvent.error)
        );

        if (errorEvent) {
          console.error("Error with layer upload processing::", errorEvent)
          dispatch({ type: 'update', payload: { processPolling: false } })
        }
      }
    }

    // -- start polling
    if(processPolling && !processPollingInterval) {
      let id = setInterval( doPolling, 3000)
      dispatch({type:'update', payload: {processPollingInterval: id}})
    } 
    // -- stop polling
    else if( processPollingInterval && !processPolling) {
      clearInterval(processPollingInterval)
      // run polling one last time in case it never finished
      doPolling()
      dispatch({type:'update', payload: {processPollingInterval: null}})
    }
  }, [processPolling, processPollingInterval, damaServerPath, etlContextId, dispatch]);

  // --- Poll Analysis Progress  
  useEffect(() => {
    const doPolling = async () => {
      const url = `${damaServerPath}/events/query?etl_context_id=${analysisContextId}&event_id=-1`
      const res = await fetch(url);
      const pollingData = await res.json();
      
      const finalEvent = pollingData.some(
        (pEvent) =>
          pEvent.type === "analysis:FINAL"
      );

      if (finalEvent) {
        dispatch({ type: 'update', payload: { analysisPolling: false, layerAnalysisReady: true } })
      }

      if (!finalEvent) {
        const errorEvent = pollingData.find(
          (pEvent) =>
            (pEvent.type.includes("analysis") && pEvent.error)
        );

        if (errorEvent) {
          console.error("Error with layer analysis::", errorEvent)
          dispatch({ type: 'update', payload: { analysisPolling: false } })
        }
      }
    }
    // -- start polling
    if(analysisPolling && !analysisPollingInterval) {
      let id = setInterval( doPolling, 3000)
      dispatch({type:'update', payload: {analysisPollingInterval: id}})
    } 
    // -- stop polling
    else if( analysisPollingInterval && !analysisPolling) {
      clearInterval(analysisPollingInterval)
      // run polling one last time in case it never finished
      doPolling()
      dispatch({type:'update', payload: {analysisPollingInterval: null}})
    }
  }, [analysisPolling, analysisPollingInterval, damaServerPath, analysisContextId, dispatch])  


  //FINAL API call, once polling is done for layer analysis
  useEffect(() => {
    const fetchAnalysis = async () => {
      const lyrAnlysRes = await fetch(
        `${damaServerPath}/gis-dataset/${gisUploadId}/${layerName}/layerAnalysis`
      );
      const lyrAnlys = await lyrAnlysRes.json();
      dispatch({type: 'update', payload: { layerAnalysis: lyrAnlys }});
    }

    //Once we are done polling (we see analysis:FINAL event), we can fire this off
    if(layerAnalysisReady) {
      fetchAnalysis()
    }
  }, [layerAnalysisReady])

  if (!layerNames) {
    return "";
  }  

  return (
    <div className='border-t border-gray-200 w-full'>
      <table className="w-full ">
        <tbody>
          <tr>
            <td className="py-4 text-left">Select Layer</td>
            <td className="py-4 text-center">
              <select
                className="text-center w-1/2 bg-white p-2 shadow bg-grey-50 focus:bg-blue-100 border-gray-300"
                value={layerName || ""}
                onChange={(e) => dispatch({type:'update', payload: {layerName: e.target.value}})}
              >
                {["", ...layerNames].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </td>
          </tr>
          </tbody>
      </table>
      <LayerAnalysisSection state={state} />
    </div>
  );
}
