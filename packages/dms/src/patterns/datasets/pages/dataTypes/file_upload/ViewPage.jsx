import React from "react"

import { get } from "lodash-es"

import { DatasetsContext } from "../../../context";
import { getExternalEnv } from "../../../utils/datasources";

const ViewPage = ({ source }) => {

	const {
		datasources,
		baseUrl,
		useFalcor,
		user,
		DAMA_HOST
	} = React.useContext(DatasetsContext);

	const pgEnv = getExternalEnv(datasources);

	const { falcor, falcorCache } = useFalcor();

	const views = React.useMemo(() => {
		return source?.views?.length ? [...source.views] : [];
	}, [source]);

	return (
		<div className="w-fit grid grid-cols-1 gap-2">
			{ views.map(view => (
					<View key={ view.view_id }
						source={ source }
						view={ view }
						useFalcor={ useFalcor }
						pgEnv={ pgEnv }/>
				))
			}
		</div>
	)
}
export default ViewPage;

const NO_DATA = { file_type: null, dl_url: null };
const OPS = JSON.stringify({});
const IMAGE_TYPES = [
	'.jpg', '.jpeg', '.png', '.gif', '.webp',
	'.avif', '.heif', '.heic', '.tiff', '.svg'
].map(it => it.replace(".", "image/"));

const View = ({ source, view, useFalcor, pgEnv }) => {

// console.log("View::view", view)

	const lengthPath = React.useMemo(() => {
// uda[{keys:envs}].viewsById[{keys:viewIds}].options[{keys:options}].length
		return ["uda", pgEnv, "viewsById", view.view_id, "options", OPS, "length"];
	}, [pgEnv, view.view_id]);

	const [dataLength, setDataLength] = React.useState(0);

// console.log("ViewPage::View::dataLength", dataLength);

	const { falcor, falcorCache } = useFalcor();

	React.useEffect(() => {
		falcor.get(lengthPath);
	}, [falcor, lengthPath]);

	React.useEffect(() => {
		setDataLength(get(falcorCache, lengthPath, 0));
	}, [falcorCache, lengthPath]);

	React.useEffect(() => {
		if (dataLength) {
// uda[{keys:envs}].viewsById[{keys:viewIds}].options[{keys:options}].dataByIndex[{integers:indices}][{keys:attributes}]
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

// console.log("ViewPage::View::data", data);

	return (
		<div className="p-2 rounded-lg bg-gray-100">
			<div className="border-b-2 mb-2">
				{ view.name || `View ${ view.view_id }` }
			</div>
			<div className="grid grid-cols-1 gap-2">
				{ data.map((d, i) => (
						<ViewItem key={ `${ view.view_id }-${ i }` } { ...d }/>
					))
				}
			</div>
		</div>
	)
}

const ViewItem = ({ file_type, dl_url }) => {

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
		<div className="bg-gray-200 p-2 rounded-lg w-fit">
			<div>File Type: { file_type }</div>
			<a download
				className={ `
					block w-fit
					${ isImage ?
						 "px-2 pt-2 rounded hover:font-bold bg-gray-300 hover:bg-gray-400" :
						 ""
					}
				` }
				href={ dl_url }
			>
				{ !isImage ? null :
					<img src={ dl_url }/>
				}
				<div className={ `
					  flex justify-center
							${ isImage ? "" :
								`w-100 py-2 rounded flex justify-center
								 bg-gray-300 hover:bg-gray-400 hover:font-bold
								`
							}
					` }
				>
					click to download
				</div>
			</a>
			<div className={ `mt-2 relative` }
				onMouseEnter={ onMouseEnter }
				onMouseLeave={ onMouseLeave }
			>
				{ !(hovering && hasClipboard) || copied ? null :
					<div className={ `
							absolute inset-0 rounded text-white cursor-pointer
							flex items-center justify-center font-bold
						` }
						onClick={ copyToClipboard }
						style={ {
							background: "radial-gradient(rgba(0, 0, 0, 1.0), rgba(0, 0, 0, 0.2))"
						} }
					>
						click to copy URL{ isImage ? " to clipboard" : "" }
					</div>
				}
				<input type="text" readOnly ref={ setRef }
					className="block w-full p-2 focus:outline-2 hover:outline-2 rounded cursor-pointer text-center"
					value={ dl_url }
					onClick={ selectUrlInput }/>
			</div>
		</div>
	)
}