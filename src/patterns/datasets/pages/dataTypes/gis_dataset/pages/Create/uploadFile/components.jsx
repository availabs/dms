import prettyBytes from "pretty-bytes";
import get from 'lodash/get'

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
  let fileUploadStatusElem;

  if (!fileUploadStatus) {
    fileUploadStatusElem = (
      <td className="py-4 text-center">Sending GIS File to server</td>
    );
  } else {
    const { type, payload } = fileUploadStatus;

    if (/GIS_FILE_UPLOAD_PROGRESS$/.test(type)) {
      fileUploadStatusElem = <ProgressBar progress={payload?.data} />;
    } else if (/GIS_FILE_RECEIVED$/.test(type)) {
      fileUploadStatusElem = (
        <td className="py-4 text-center">File Received</td>
      );
    } else if (/START_GIS_FILE_UPLOAD_ANALYSIS$/.test(type)) {
      fileUploadStatusElem = (
        <td className="py-4 text-center">Server Analyzing the GIS File</td>
      );
    } else if (/FINISH_GIS_FILE_UPLOAD$/.test(type)) {
      fileUploadStatusElem = (
        <td className="py-4 text-center">GIS File Analysis Complete</td>
      );
    } else {
      fileUploadStatusElem = <td className="py-4 text-center">Processing</td>;
    }
  }

  return (
    <tr>
      <td className="py-4 text-left">File Upload Status</td>
      {fileUploadStatusElem}
    </tr>
  );
}

export function GisDatasetFileMeta({ uploadedFile, fileUploadStatus }) {
  if (!uploadedFile) {
    return "";
  }


  return (
    <div>
      <div className='font-bold'>
        <span>File Metadata</span>
      </div>

      <table className="w-full">
        <tbody>
          <tr key="uploaded-file-meta--name" className="border-b">
            <td className="py-4 text-left">Name</td>
            <td className="text-center  p-2">{uploadedFile.name}</td>
          </tr>

          <tr key="uploaded-file-meta--last-mod-ts" className="border-b">
            <td className="py-4 text-left">Last Modified</td>
            <td className="text-center  p-2">
              {get(uploadedFile,'lastModifiedDate', '').toLocaleString()}
            </td>
          </tr>

          <tr key="uploaded-file-meta--size" className="border-b">
            <td className="py-4 text-left">Size</td>
            <td className="text-center  p-2">
              {prettyBytes(uploadedFile.size)}
            </td>
          </tr>

          <GisDatasetUploadStatusElem fileUploadStatus={fileUploadStatus} />
        </tbody>
      </table>
    </div>
  );
}

export function GisDatasetUploadErrorMessage({ etlContextId, uploadErrMsg }) {
  return (
    <table
      className="w-2/3 mx-auto text-center"
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
