
export const LayerAnalysisSection = ({state}) => {
  
  const { 
    etlContextId, 
    layerName, 
    lyrAnlysErrMsg, 
    layerAnalysis 
  } = state;
  
  if (!layerName) {
    return "";
  }

  if (lyrAnlysErrMsg) {
    return <ErrorMessage 
      etlContextId={etlContextId}
      errorMsg={lyrAnlysErrMsg}
    />
  }

  if (!layerAnalysis) {
    return <div>Analyzing Layer... please wait.</div>;
  }

  const { layerGeometriesAnalysis } = layerAnalysis;

  const {  countsByPostGisType={}, /* featuresCount, commonPostGisGeometryType */ } =
    layerGeometriesAnalysis;

  // const plSfx = featuresCount > 1 ? "s" : "";

  const geomTypes = Object.keys(countsByPostGisType).sort(
    (a, b) => countsByPostGisType[b] - countsByPostGisType[a]
  );

  return (
    <div>
      <span className='py-4 font-bold'> Layer Analysis </span>
      <div className='w-full'>
        <div style={{ width: "50%", margin: "10px auto" }}>
          <table className='pt-10 mx-auto border'>
            <thead style={{ backgroundColor: "black", color: "white" }}>
              <tr>
                <th
                  className="text-center"
                  style={{ padding: "10px", borderRight: "1px solid white" }}
                >
                  Geometry Type
                </th>
                <th className="text-center" style={{ padding: "10px" }}>
                  Feature Count
                </th>
              </tr>
            </thead>
            <tbody>
              {geomTypes.map((type,i) => (
                <tr className="border-b" key={i}>
                  <td
                    className="py-4 text-center"
                    style={{ padding: "10px", border: "1px solid" }}
                  >
                    {type}
                  </td>
                  <td
                    className="text-center  p-2"
                    style={{ padding: "10px", border: "1px solid" }}
                  >
                    {countsByPostGisType[type]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/*For consistency, all features will be converted to{" "}
          {commonPostGisGeometryType}s.*/}
        </div>
      </div>
    </div>
  );
};



export const ErrorMessage = ({etlContextId, errorMsg}) => (
  <table className="w-2/3 mx-auto mt-10 text-center border border-gray-300">
    <thead className='bg-red-500 font-bold text-lg'>
      <tr>
        <th>
          Layer Analysis Error
        </th>
        <th>
          ETL Context ID
        </th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td className='text-red-800 p-4'>
          {errorMsg}
        </td>
        <td>
          {etlContextId}
        </td>
      </tr>
    </tbody>
  </table>
)