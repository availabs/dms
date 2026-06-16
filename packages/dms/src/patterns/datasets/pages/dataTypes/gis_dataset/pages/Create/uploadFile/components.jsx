//import prettyBytes from "pretty-bytes";
import { get } from 'lodash-es'
import { useContext } from 'react'
import { ThemeContext } from '../../../../../../../../ui/useTheme'
import { gisCreateTheme } from '../gisCreate.theme'

export function ProgressBar({ progress }) {
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


export function GisDatasetUploadStatusElem({ fileUploadStatus }) {
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  let fileUploadStatusElem;

  if (!fileUploadStatus) {
    fileUploadStatusElem = (
      <td className={t.fileMetaStatusTd}>Sending GIS File to server</td>
    );
  } else {
    const { type, payload } = fileUploadStatus;

    if (/GIS_FILE_UPLOAD_PROGRESS$/.test(type)) {
      fileUploadStatusElem = <ProgressBar progress={payload?.data || payload} />;
    } else if (/GIS_FILE_RECEIVED$/.test(type)) {
      fileUploadStatusElem = (
        <td className={t.fileMetaStatusTd}>File Received</td>
      );
    } else if (/START_GIS_FILE_UPLOAD_ANALYSIS$/.test(type)) {
      fileUploadStatusElem = (
        <td className={t.fileMetaStatusTd}>Server Analyzing the GIS File</td>
      );
    } else if (/FINISH_GIS_FILE_UPLOAD$/.test(type)) {
      fileUploadStatusElem = (
        <td className={t.fileMetaStatusTd}>GIS File Analysis Complete</td>
      );
    } else {
      fileUploadStatusElem = <td className={t.fileMetaStatusTd}>Processing</td>;
    }
  }

  return (
    <tr>
      <td className={t.fileMetaTdLeft}>File Upload Status</td>
      {fileUploadStatusElem}
    </tr>
  );
}

export function GisDatasetFileMeta({ uploadedFile, fileUploadStatus }) {
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  if (!uploadedFile) {
    return "";
  }


  return (
    <div>
      <div className={t.fileMetaTitle}>
        <span>File Metadata</span>
      </div>

      <table className={t.fileMetaTable}>
        <tbody>
          <tr key="uploaded-file-meta--name" className={t.fileMetaRowBorder}>
            <td className={t.fileMetaTdLeft}>Name</td>
            <td className={t.fileMetaTdCenter}>{uploadedFile.name}</td>
          </tr>

          <tr key="uploaded-file-meta--last-mod-ts" className={t.fileMetaRowBorder}>
            <td className={t.fileMetaTdLeft}>Last Modified</td>
            <td className={t.fileMetaTdCenter}>
              {get(uploadedFile,'lastModifiedDate', '').toLocaleString()}
            </td>
          </tr>

          <tr key="uploaded-file-meta--size" className={t.fileMetaRowBorder}>
            <td className={t.fileMetaTdLeft}>Size</td>
            <td className={t.fileMetaTdCenter}>
              {uploadedFile.size}
            </td>
          </tr>

          <GisDatasetUploadStatusElem fileUploadStatus={fileUploadStatus} />
        </tbody>
      </table>
    </div>
  );
}

export function GisDatasetUploadErrorMessage({ etlContextId, uploadErrMsg }) {
  const { theme } = useContext(ThemeContext) || {};
  const t = { ...gisCreateTheme, ...(theme?.datasets?.gisCreate || {}) };
  return (
    <table
      className={t.uploadErrorTable}
      style={{
        margin: "40px auto",
        textAlign: "center",
        border: "1px solid",
        borderColor: "back",
      }}
    >
      <thead
        style={{
          color: "black",
          backgroundColor: "red",
          fontWeight: "bolder",
          textAlign: "center",
          marginTop: "40px",
          fontSize: "20px",
          border: "1px solid",
          borderColor: "black",
        }}
      >
        <tr>
          <th style={{ border: "1px solid", borderColor: "black" }}>
            {" "}
            GIS Dataset Upload Error
          </th>
          <th style={{ border: "1px solid", borderColor: "black" }}>
            {" "}
            ETL Context ID
          </th>
        </tr>
      </thead>
      <tbody style={{ border: "1px solid" }}>
        <tr style={{ border: "1px solid" }}>
          <td
            style={{
              border: "1px solid",
              padding: "10px",
              backgroundColor: "white",
              color: "darkred",
            }}
          >
            {uploadErrMsg}
          </td>
          <td style={{ border: "1px solid", backgroundColor: "white" }}>
            {etlContextId}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
