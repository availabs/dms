import { useContext, useRef } from 'react'
import { ThemeContext } from '../../../../../../../../ui/useTheme'
import { gisCreateTheme } from '../gisCreate.theme'

export const LayerAnalysisSection = ({state}) => {
  const { theme, UI } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  const { Table } = UI || {};
  const gridRef = useRef();
  
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
    return <div className={t.analyzingMsg || undefined}>Analyzing Layer... please wait.</div>;
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
        {/* UI.Table (`t.tableStyle`, 2026-10-14 ui-control-tables.md); each cell's wrapper takes the table's
            cell class, the inner element this theme's class */}
        <Table data={geomTypes.map(type => ({ type, count: countsByPostGisType[type] }))} gridRef={gridRef}
          isEdit={false} activeStyle={t.tableStyle || undefined} display={{ disableCellSelection: true }}
          columns={[
            { name: "type", display_name: "Geometry Type", show: true, type: "ui",
              Comp: ({ value, className }) => <div className={className}><span className={t.layerAnalysisTdType}>{value}</span></div> },
            { name: "count", display_name: "Feature Count", show: true, type: "ui",
              Comp: ({ value, className }) => <div className={className}><span className={t.layerAnalysisTdCount}>{value}</span></div> },
          ]}/>
          {/*For consistency, all features will be converted to{" "}
          {commonPostGisGeometryType}s.*/}
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