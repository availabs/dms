import React from "react"

import { useNavigate } from "react-router";

import { format as d3format } from "d3-format"

import { DatasetsContext } from "../../../context";
import { getExternalEnv } from "../../../utils/datasources";

// import { DAMA_HOST } from "~/config";
// import { DamaContext } from "~/pages/DataManager/store";

const MIN_SOURCE_NAME_LENGTH = 4;
const intFormat = d3format(",d");

const CreatePage = ({ source }) => {

	const sourceId = React.useMemo(() => {
		return source?.source_id || null;
	}, [source]);

	const sourceName = React.useMemo(() => {
		return source?.name || "";
	}, [source]);

  const okToUpload = React.useMemo(() => {
  	return sourceName.length >= MIN_SOURCE_NAME_LENGTH;
  }, [sourceName]);

	const [ref, setRef] = React.useState(null);

	const [file, setFile] = React.useState(null);
	const doSetFile = React.useCallback(e => {
		setFile(e.target.files[0]);
	}, []);
	const clickFileInput = React.useCallback(e => {
		ref.click();
	}, [ref]);

	return (
		<div className="grid grid-cols-1 gap-2 relative">
			<div className="flex">
				<input type="file"
					ref={ setRef }
					className="hidden"
					onChange={ doSetFile }/>
				<button onClick={ clickFileInput }
					disabled={ !okToUpload }
					className={ `
						bg-gray-200 hover:bg-gray-300
						hover:cursor-pointer
						hover:disabled:bg-gray-200 disabled:opacity-50
						hover:disabled:cursor-not-allowed
						w-60 py-2 rounded cursor-pointer
					` }
				>
					Select a File
				</button>
				{ sourceName.length >= MIN_SOURCE_NAME_LENGTH ? null :
					<div className="flex-1 flex justify-end items-center">
						Enter a source name of length { MIN_SOURCE_NAME_LENGTH } or longer.
					</div>
				}
			</div>
			{ !file ? null :
				<File file={ file }
					sourceId={ sourceId }
					sourceName={ sourceName }
					okToUpload={ okToUpload }/>
			}
		</div>
	)
}

export default CreatePage;

const File = ({ file, sourceId, sourceName, okToUpload }) => {

	const {
		datasources,
		baseUrl,
		falcor,
		user,
		DAMA_HOST
	} = React.useContext(DatasetsContext);
	const pgEnv = getExternalEnv(datasources);

	const [directory, setDirectory] = React.useState("");
	const doSetDirectory = React.useCallback(e => {
		setDirectory(e.target.value);
	}, []);

  const [description, setDescription] = React.useState("");
  const doSetDescription = React.useCallback(e => {
  	setDescription(e.target.value);
  }, []);

  const [uploading, setUploading] = React.useState(false);

  const navigate = useNavigate();

  const [error, setError] = React.useState(null);
  const clearError = React.useCallback(e => {
  	setError(null);
  }, []);

  React.useEffect(() => {
  	setError("");
  }, [file]);

  const uploadFile = React.useCallback(e => {

  	setUploading(true);

    const formData = new FormData();

    formData.append("source_name", sourceName);
    formData.append("type", "file_upload");

    formData.append("file_name", file.name);
    formData.append("file_type", file.type || "application/octet-stream");
    formData.append("directory", directory);
    formData.append("description", description);

    formData.append("categories", JSON.stringify([["Uploaded File"]]));

    if (sourceId) {
    	formData.append("source_id", sourceId);
    }
    if (user?.id) {
    	formData.append("user_id", user?.id);
    }
    formData.append("file", file);

    fetch(
      `${ DAMA_HOST }/dama-admin/${ pgEnv }/file_upload`,
      { method: "POST", body: formData }
    ).then(res => res.json())
      .then(json => {
        console.log("FILE UPLOAD RESPONSE:", json);
        if (json.ok) {
        	navigate(`${ baseUrl }/source/${ json.source_id }`);
        }
        else {
        	setError(json.error);
        }
      })
      .finally(e => setUploading(false));

  }, [DAMA_HOST, pgEnv, baseUrl, file, sourceName,
  		description, user, navigate, sourceId, directory
  	]);

	return (
		<>
			{ !uploading ? null :
				<div className={ `
						bg-black/75 absolute inset-0 rounded
						text-white text-5xl font-extrabold z-50
						flex items-center justify-center
					` }
				>
					UPLOADING FILE...
				</div>
			}
			{ !error ? null :
				<div className={ `
						bg-black/85 absolute inset-0 rounded
						text-white text-2xl font-extrabold z-50
						flex flex-col items-center justify-center
					` }
				>
					<div>There was an error uploading your file:</div>
					<div>{ error }</div>
					<button onClick={ clearError }
						className={ `
							bg-green-200 hover:bg-green-300 hover:disabled:bg-green-200 mt-2
							disabled:opacity-50 hover:disabled:cursor-not-allowed
							w-60 py-2 rounded cursor-pointer text-black
							absolute bottom-2 right-2 text-base font-normal
						` }
					>
						Close
					</button>
				</div>
			}
			<div>
				<div className="text-xl font-extrabold border-b-3 flex">
					File Info
				</div>

				<div className="grid grid-cols-5">
					<div className="col-span-2 font-bold pl-6">file name:</div>
					<div className="col-span-3">{ file.name }</div>
				</div>
				<div className="grid grid-cols-5">
					<div className="col-span-2 font-bold pl-6">file size:</div>
					<div className="col-span-3">{ intFormat(file.size) } bytes</div>
				</div>
				<div className="grid grid-cols-5">
					<div className="col-span-2 font-bold pl-6">file type:</div>
					<div className="col-span-3">
						{ file.type || "application/octet-stream" }
					</div>
				</div>
				<div className="grid grid-cols-5">
					<div className="col-span-2 font-bold pl-6">last modified:</div>
					<div className="col-span-3">
						{ (new Date(file.lastModified)).toLocaleString() }
					</div>
				</div>

				<div className="border-b-3"/>

				<div className="grid grid-cols-5 my-1">
					<div className="text-xl font-extrabold col-span-2 whitespace-nowrap">
						Directory Path:
					</div>
					<input type="text"
						value={ directory }
						onChange={ doSetDirectory }
						placeholder="enter an optional directory path..."
						className="px-2 py-1 bg-white border rounded block w-full col-span-3"
						rows="5"/>
				</div>

				<div className="border-b-3"/>

				<div className="grid grid-cols-5 mt-1">
					<div className="text-xl font-extrabold col-span-2 whitespace-nowrap">
						Description:
					</div>
					<textarea value={ description }
						onChange={ doSetDescription }
						placeholder="enter an optional description..."
						className="px-2 py-1 bg-white border rounded block w-full col-span-3"
						rows="5"/>
				</div>

				<div className="flex justify-end items-center mb-1">
					<button onClick={ uploadFile }
						disabled={ !okToUpload }
						className={ `
							bg-green-200 hover:bg-green-300 hover:disabled:bg-green-200 mt-1
							disabled:opacity-50 hover:disabled:cursor-not-allowed
							w-60 py-2 rounded cursor-pointer
						` }
					>
						Upload File
					</button>
				</div>

			</div>
		</>
	)
}