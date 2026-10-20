//import prettyBytes from "pretty-bytes";
import { get } from 'lodash-es'
import { useContext, useRef } from 'react'
import { ThemeContext } from '../../../../../../../../ui/useTheme'
import { gisCreateTheme } from '../gisCreate.theme'
import GisErrorTable from '../ErrorTable'

export function ProgressBar({ progress }) {
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  if (t.progressWrap) {
    return (
      <div className={t.progressWrap}>
        <span className={t.progressLabel}>Sent</span>
        <div className={t.progressTrack}><div className={t.progressFill} style={{ width: `${progress}%` }}/></div>
        <span className={t.progressText}>{`${progress}%`}</span>
      </div>
    );
  }
  const Parentdiv = {
    display: "inline-block",
    height: "100%",
    width: "100%",
    backgroundColor: "whitesmoke",
    borderRadius: 40,
    margin: 50,
  };

  const divWidth = (progress) * .9;
  const Childdiv = {
    display: "inline-block",
    height: "84%",
    width: `${divWidth}%`,
    backgroundColor: "#3b82f680",
    borderRadius: 40,
    textAlign: "right",
  };

  const progresstext = {
    padding: 10,
    color: "black",
    fontWeight: 900,
  };

  return (
    <div style={Parentdiv}>
      <span
        style={{
          fontWeight: "bold",
          paddingLeft: "10px",
          paddingRight: "10px",
        }}
      >
        {" "}
        Sent:
      </span>

      <div style={Childdiv}>
        <span style={progresstext}>{`${progress}%`}</span>
      </div>
    </div>
  );
}


// the upload status text, or the progress bar while the file is being sent
function uploadStatusValue(fileUploadStatus) {
  if (!fileUploadStatus) return "Sending GIS File to server";
  const { type, payload } = fileUploadStatus;
  if (/GIS_FILE_UPLOAD_PROGRESS$/.test(type)) return <ProgressBar progress={payload?.data || payload} />;
  if (/GIS_FILE_RECEIVED$/.test(type)) return "File Received";
  if (/START_GIS_FILE_UPLOAD_ANALYSIS$/.test(type)) return "Server Analyzing the GIS File";
  if (/FINISH_GIS_FILE_UPLOAD$/.test(type)) return "GIS File Analysis Complete";
  return "Processing";
}

// key / value cells: the wrapper takes the table's cell class, the inner span this theme's text class
const MetaLabelCell = ({ value, className, row }) => (
  <div className={className}><span className={row?.labelClass}>{value}</span></div>
);
const MetaValueCell = ({ value, className, row }) => (
  <div className={className}>{typeof value === 'string' || typeof value === 'number'
    ? <span className={row?.valueClass}>{value}</span> : value}</div>
);

export function GisDatasetFileMeta({ uploadedFile, fileUploadStatus }) {
  const { theme, UI } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  const { Table } = UI || {};
  const gridRef = useRef();
  if (!uploadedFile) {
    return "";
  }

  const cls = { labelClass: t.fileMetaTdLeft, valueClass: t.fileMetaTdCenter };
  // a headerless UI.Table 'list' (2026-10-15: was a hand-built <table>; the status row put a <div> in a <tr>)
  const rows = [
    { label: "Name", value: uploadedFile.name, ...cls },
    { label: "Last Modified", value: get(uploadedFile, 'lastModifiedDate', '').toLocaleString(), ...cls },
    { label: "Size", value: uploadedFile.size, ...cls },
    { label: "File Upload Status", value: uploadStatusValue(fileUploadStatus), ...cls },
  ];

  return (
    <div>
      <div className={t.fileMetaTitle}>
        <span>File Metadata</span>
      </div>

      <div className={t.fileMetaOuter}>
        <Table data={rows} gridRef={gridRef} isEdit={false} activeStyle={t.tableStyle || undefined}
          display={{ disableCellSelection: true, hideHeader: true, disableColumnResize: true }}
          columns={[
            { name: "label", display_name: "Field", show: true, type: "ui", Comp: MetaLabelCell, size: 176 },
            { name: "value", display_name: "Value", show: true, type: "ui", Comp: MetaValueCell },
          ]}/>
      </div>
    </div>
  );
}

export function GisDatasetUploadErrorMessage({ etlContextId, uploadErrMsg }) {
  return <GisErrorTable title="GIS Dataset Upload Error" message={uploadErrMsg} etlContextId={etlContextId} />;
}
