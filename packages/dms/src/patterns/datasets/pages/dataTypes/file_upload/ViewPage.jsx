import React from "react"

import { get } from "lodash-es"

import { DatasetsContext } from "../../../context";
import { getExternalEnv } from "../../../utils/datasources";
import { ThemeContext } from "../../../../../ui/useTheme";
import { viewPageTheme } from "./ViewPage.theme";

const ViewPage = ({ source, isDms }) => {
	const { theme } = React.useContext(ThemeContext) || {};
	const t = { ...viewPageTheme, ...(theme?.datasets?.fileUploadViewPage || {}) };

	const {
		app,
		datasources,
		useFalcor,
	} = React.useContext(DatasetsContext);

	const pgEnv = getExternalEnv(datasources);

	const views = React.useMemo(() => {
		return source?.views?.length ? [...source.views] : [];
	}, [source]);

	return (
		<div className={t.viewPageWrapper}>
			{ views.map(view => (
					isDms
						? <DmsView key={ view.view_id }
								app={ app }
								view={ view }
								useFalcor={ useFalcor }/>
						: <LegacyView key={ view.view_id }
								view={ view }
								useFalcor={ useFalcor }
								pgEnv={ pgEnv }/>
				))
			}
		</div>
	)
}
export default ViewPage;

const IMAGE_TYPES = [
	'.jpg', '.jpeg', '.png', '.gif', '.webp',
	'.avif', '.heif', '.heic', '.tiff', '.svg'
].map(it => it.replace(".", "image/"));

const OPS = JSON.stringify({});

// DMS-backed view — file metadata lives in the view row's `data.file` object.
// Read via the app-namespaced byId falcor route.
const DmsView = ({ app, view, useFalcor }) => {
	const { theme } = React.useContext(ThemeContext) || {};
	const t = { ...viewPageTheme, ...(theme?.datasets?.fileUploadViewPage || {}) };
	const { falcor, falcorCache } = useFalcor();

	const viewId = React.useMemo(() => +view.view_id, [view]);

	React.useEffect(() => {
		if (!viewId) return;
		falcor.get(["dms", "data", app, "byId", viewId, "data"]);
	}, [falcor, app, viewId]);

	const data = get(
		falcorCache,
		["dms", "data", app, "byId", String(viewId), "data", "value"],
		null
	);

	const file = data?.file;

	return (
		<div className={t.viewCard}>
			<div className={t.viewCardHeader}>
				{ view.name || `View ${ viewId }` }
			</div>
			<div className={t.viewCardGrid}>
				{ file ? <ViewItem { ...file }/> : (
					<div className={t.viewCardEmpty}>No file attached.</div>
				) }
			</div>
		</div>
	)
}

// Legacy pgEnv-backed view — file metadata lives in data_manager.views.metadata
// and is surfaced via UDA dataByIndex.
const LegacyView = ({ view, useFalcor, pgEnv }) => {
	const { theme } = React.useContext(ThemeContext) || {};
	const t = { ...viewPageTheme, ...(theme?.datasets?.fileUploadViewPage || {}) };

	const lengthPath = React.useMemo(() => {
		return ["uda", pgEnv, "viewsById", view.view_id, "options", OPS, "length"];
	}, [pgEnv, view.view_id]);

	const [dataLength, setDataLength] = React.useState(0);

	const { falcor, falcorCache } = useFalcor();

	React.useEffect(() => {
		falcor.get(lengthPath);
	}, [falcor, lengthPath]);

	React.useEffect(() => {
		setDataLength(get(falcorCache, lengthPath, 0));
	}, [falcorCache, lengthPath]);

	React.useEffect(() => {
		if (dataLength) {
			falcor.get([
				"uda", pgEnv, "viewsById", view.view_id, "options", OPS,
				"dataByIndex", { from: 0, to: dataLength - 1 },
				["file_type", "dl_url"]
			])
		}
	}, [falcor, view.view_id, pgEnv, dataLength]);

	const [data, setData] = React.useState([]);

	React.useEffect(() => {
		const dataPath = [
			"uda", pgEnv, "viewsById", view.view_id, "options", OPS, "dataByIndex"
		]
		const data = [];
		for (let i = 0; i < dataLength; ++i) {
			const d = get(falcorCache, [...dataPath, i], null);
			if (d) {
				data.push(d);
			}
		}
		setData(data);
	}, [falcorCache, view.view_id, pgEnv, dataLength]);

	return (
		<div className={t.viewCard}>
			<div className={t.viewCardHeader}>
				{ view.name || `View ${ view.view_id }` }
			</div>
			<div className={t.viewCardGrid}>
				{ data.map((d, i) => (
						<ViewItem key={ `${ view.view_id }-${ i }` } { ...d }/>
					))
				}
			</div>
		</div>
	)
}

const ViewItem = ({ file_type, dl_url }) => {
	const { theme } = React.useContext(ThemeContext) || {};
	const t = { ...viewPageTheme, ...(theme?.datasets?.fileUploadViewPage || {}) };

	const isImage = React.useMemo(() => {
		return IMAGE_TYPES.includes(file_type);
	}, [file_type]);

	const hasClipboard = React.useMemo(() => {
		return Boolean(navigator?.clipboard?.writeText);
	}, []);

	const [hovering, setHovering] = React.useState(false);
	const [copied, setCopied] = React.useState(false);
	const [ref, setRef] = React.useState(null);

	const onMouseEnter = React.useCallback(e => {
		setHovering(true);
	}, []);
	const onMouseLeave = React.useCallback(e => {
		setHovering(false);
		setCopied(false);
	}, []);

	const copyToClipboard = React.useCallback(e => {
		navigator.clipboard.writeText(dl_url);
		setCopied(true);
		ref && (ref.focus(), ref.select());
	}, [dl_url, ref]);

	const selectUrlInput = React.useCallback(e => {
		e.target.select();
	}, []);

	return (
		<div className={t.viewItemWrapper}>
			<div>File Type: { file_type }</div>
			<a download
				className={ isImage ? t.viewItemLinkImage : t.viewItemLink }
				href={ dl_url }
			>
				{ !isImage ? null :
					<img src={ dl_url }/>
				}
				<div className={ isImage ? t.viewItemDownloadLabelImage : t.viewItemDownloadLabel }>
					click to download
				</div>
			</a>
			<div className={t.viewItemCopyRow}
				onMouseEnter={ onMouseEnter }
				onMouseLeave={ onMouseLeave }
			>
				{ !(hovering && hasClipboard) || copied ? null :
					<div className={t.viewItemCopyOverlay}
						onClick={ copyToClipboard }
						style={ {
							background: "radial-gradient(rgba(0, 0, 0, 1.0), rgba(0, 0, 0, 0.2))"
						} }
					>
						click to copy URL{ isImage ? " to clipboard" : "" }
					</div>
				}
				<input type="text" readOnly ref={ setRef }
					className={t.viewItemUrlInput}
					value={ dl_url }
					onClick={ selectUrlInput }/>
			</div>
		</div>
	)
}
