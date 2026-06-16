import { useContext } from 'react'
import { ThemeContext } from '../../../../../../../../ui/useTheme'
import { gisCreateTheme } from '../gisCreate.theme'

export const LayerAnalysisSection = ({state}) => {
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  
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
      <span className={t.layerAnalysisTitle}> Layer Analysis </span>
      <div className={t.layerAnalysisOuter}>
        <div style={{ width: "50%", margin: "10px auto" }}>
          <table className={t.layerAnalysisTable}>
            <thead style={{ backgroundColor: "black", color: "white" }}>
              <tr>
                <th
                  className={t.layerAnalysisThCenter}
                  style={{ padding: "10px", borderRight: "1px solid white" }}
                >
                  Geometry Type
                </th>
                <th className={t.layerAnalysisThCenter} style={{ padding: "10px" }}>
                  Feature Count
                </th>
              </tr>
            </thead>
            <tbody>
              {geomTypes.map((type,i) => (
                <tr className={t.layerAnalysisRowBorder} key={i}>
                  <td
                    className={t.layerAnalysisTdType}
                    style={{ padding: "10px", border: "1px solid" }}
                  >
                    {type}
                  </td>
                  <td
                    className={t.layerAnalysisTdCount}
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



export const ErrorMessage = ({etlContextId, errorMsg}) => {
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  return (
    <table className={t.errorTable}>
      <thead className={t.errorThead}>
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
          <td className={t.errorTdMsg}>
            {errorMsg}
          </td>
          <td>
            {etlContextId}
          </td>
        </tr>
      </tbody>
    </table>
  )
}