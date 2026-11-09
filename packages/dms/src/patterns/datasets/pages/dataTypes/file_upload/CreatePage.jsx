import React from "react"

import { useNavigate } from "react-router";

import { format as d3format } from "d3-format"

import { DatasetsContext } from "../../../context";
import { getInstance } from "../../../../../utils/type-utils";
import { clearDatasetsListCache } from "../../../utils/datasetsListCache";
import { ThemeContext } from "../../../../../ui/useTheme";
import { createPageTheme } from "./CreatePage.theme";
import CreateStep from "../../../components/CreateStep";
import { authedFetch } from "../../../../../utils/authedFetch";

const MIN_SOURCE_NAME_LENGTH = 4;
const intFormat = d3format(",d");

const CreatePage = ({ source }) => {
	const { theme } = React.useContext(ThemeContext) || {};
	const t = { ...createPageTheme, ...(theme?.datasets?.fileUploadCreate || {}) };
	const { UI } = React.useContext(DatasetsContext) || {};
	const { FileInput } = UI || {};

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

	const [file, setFile] = React.useState(null);
	const doSetFile = React.useCallback(files => {
		setFile(files[0]);
	}, []);

	return (
		<div className={t.wrapper}>
			<CreateStep n={1} title="Select a file" state={file ? 'done' : 'active'}>
			<div className={t.topRow}>
				<FileInput
					label="Select a File"
					disabled={ !okToUpload }
					showFileName={ false }
					onChange={ doSetFile }/>
				{ okToUpload ? null :
					<div className={t.noNameHint}>
						Enter a source name of length { MIN_SOURCE_NAME_LENGTH } or longer.
					</div>
				}
			</div>
			</CreateStep>
			{ !file ? null :
				<CreateStep n={2} title="File info">
				<File file={ file }
					sourceId={ sourceId }
					sourceName={ sourceName }
					okToUpload={ okToUpload }/>
				</CreateStep>
			}
		</div>
	)
}

export default CreatePage;

const File = ({ file, sourceId, sourceName, okToUpload }) => {
	const { theme } = React.useContext(ThemeContext) || {};
	const t = { ...createPageTheme, ...(theme?.datasets?.fileUploadCreate || {}) };

	const {
		UI,
		app,
		baseUrl,
		falcor,
		user,
		dmsEnv,
		parent,
		// DAMA_HOST,
		API_HOST
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

  const { Button, Input, Textarea } = UI;
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

    authedFetch(
      `${ API_HOST }/dms-admin/${ app }/file_upload`,
      { method: "POST", body: formData, user, pattern: { app, id: parent?.id } }
    ).then(res => res.json())
      .then(json => {

console.log("uploadFile::response", json);

        if (json.ok) {
        	// Invalidate the owner row so its updated sources list is refetched,
        	// and the new source/view rows so the detail page renders the file.
        	Promise.all([
        		falcor.invalidate(["dms", "data", app, "byId", owner.id]),
        		falcor.invalidate(["dms", "data", app, "byId", json.source_id]),
        		falcor.invalidate(["dms", "data", app, "byId", json.view_id]),
        	]).finally(() => {
        		clearDatasetsListCache();
        		// /dms-admin/:app/file_upload always creates a DMS-internal source.
        		navigate(`${ baseUrl }/internal_source/${ json.source_id }`);
        	});
        }
        else {
        	setError(json.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(e => setUploading(false));

  }, [API_HOST, app, owner, ownerInstance, baseUrl, file, sourceName,
  		description, user, navigate, sourceId, directory, falcor, parent?.id
  	]);

	return (
		<>
			{ !uploading ? null :
				<div className={t.uploadingOverlay}>
					{ t.uploadingText }
				</div>
			}
			{ !error ? null :
				<div className={t.errorOverlay}>
					<div>There was an error uploading your file:</div>
					<div>{ error }</div>
					<div className={t.errorCloseWrap}>
						<Button activeStyle="action" onClick={ clearError }>
							Close
						</Button>
					</div>
				</div>
			}
			<div>
				<div className={t.fileInfoTitle}>
					File Info
				</div>

				<div className={t.fileInfoGrid}>
					<div className={t.fileInfoLabel}>file name:</div>
					<div className={t.fileInfoValue}>{ file.name }</div>
				</div>
				<div className={t.fileInfoGrid}>
					<div className={t.fileInfoLabel}>file size:</div>
					<div className={t.fileInfoValue}>{ intFormat(file.size) } bytes</div>
				</div>
				<div className={t.fileInfoGrid}>
					<div className={t.fileInfoLabel}>file type:</div>
					<div className={t.fileInfoValue}>
						{ file.type || "application/octet-stream" }
					</div>
				</div>
				<div className={t.fileInfoGrid}>
					<div className={t.fileInfoLabel}>last modified:</div>
					<div className={t.fileInfoValue}>
						{ (new Date(file.lastModified)).toLocaleString() }
					</div>
				</div>

				<div className={t.divider}/>

				<div className={t.dirPathRow}>
					<div className={t.dirPathLabel}>
						Directory Path:
					</div>
					<div className={t.dirPathField}>
						<Input
							value={ directory }
							onChange={ doSetDirectory }
							placeholder="enter an optional directory path..."/>
					</div>
				</div>

				<div className={t.divider}/>

				<div className={t.descRow}>
					<div className={t.descLabel}>
						Description:
					</div>
					<div className={t.descField}>
						<Textarea value={ description }
							onChange={ doSetDescription }
							placeholder="enter an optional description..."
							rows="5"/>
					</div>
				</div>

				<div className={t.uploadBtnRow}>
					<Button activeStyle="primary" onClick={ uploadFile } disabled={ !okToUpload }>
						Upload File
					</Button>
				</div>

			</div>
		</>
	)
}
