import React from "react"

import { useNavigate } from "react-router";

import { format as d3format } from "d3-format"

import { DatasetsContext } from "../../../context";
import { getInstance } from "../../../../../utils/type-utils";
import { clearDatasetsListCache } from "../../../utils/datasetsListCache";

const MIN_SOURCE_NAME_LENGTH = 4;
const intFormat = d3format(",d");

const CreatePage = ({ source }) => {

	const sourceId = React.useMemo(() => {
		return source?.source_id || null;
	}, [source]);

	const sourceName = React.useMemo(() => {
		return source?.name || "";
	}, [source]);

  // When appending a new file to an existing source, the source_name field
  // is ignored — only the file payload matters.
  const okToUpload = React.useMemo(() => {
  	return Boolean(sourceId) || sourceName.length >= MIN_SOURCE_NAME_LENGTH;
  }, [sourceId, sourceName]);

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
				{ okToUpload ? null :
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
		app,
		baseUrl,
		falcor,
		user,
		dmsEnv,
		parent,
		DAMA_HOST,
	} = React.useContext(DatasetsContext);

	// Owner row that holds the `sources` ref list. dmsEnv is the canonical
	// owner; fall back to the pattern row for legacy patterns that never
	// migrated to dmsEnv. Mirrors datasets/pages/CreatePage.jsx.
	const owner = dmsEnv || parent;
	const ownerInstance = owner?.type ? getInstance(owner.type) : null;

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

  	if (!owner?.id || !ownerInstance) {
  		setError("No dmsEnv or parent pattern available to own the source.");
  		return;
  	}

  	setUploading(true);

    const formData = new FormData();

    formData.append("owner_id", owner.id);
    formData.append("owner_instance", ownerInstance);
    formData.append("owner_ref", `${app}+${ownerInstance}|source`);

    formData.append("file_name", file.name);
    formData.append("file_type", file.type || "application/octet-stream");
    formData.append("directory", directory);
    formData.append("description", description);

    formData.append("categories", JSON.stringify([["Uploaded File"]]));

    if (sourceId) {
    	// Server derives source_slug from the existing source row's type.
    	formData.append("source_id", sourceId);
    } else {
    	formData.append("source_name", sourceName);
    }
    if (user?.id) {
    	formData.append("user_id", user.id);
    }
    formData.append("file", file);

    fetch(
      `${ DAMA_HOST }/dms-admin/${ app }/file_upload`,
      { method: "POST", body: formData }
    ).then(res => res.json())
      .then(json => {
        if (json.ok) {
        	// Invalidate the owner row so its updated sources list is refetched,
        	// and the new source/view rows so the detail page renders the file.
        	Promise.all([
        		falcor.invalidate(["dms", "data", app, "byId", owner.id]),
        		falcor.invalidate(["dms", "data", app, "byId", json.source_id]),
        		falcor.invalidate(["dms", "data", app, "byId", json.view_id]),
        	]).finally(() => {
        		clearDatasetsListCache();
        		navigate(`${ baseUrl }/source/${ json.source_id }`);
        	});
        }
        else {
        	setError(json.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(e => setUploading(false));

  }, [DAMA_HOST, app, owner, ownerInstance, baseUrl, file, sourceName,
  		description, user, navigate, sourceId, directory, falcor
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
