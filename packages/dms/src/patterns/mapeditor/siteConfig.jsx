import React from "react"

import { cloneDeep } from "lodash-es";

import { useFalcor } from "@availabs/avl-falcor"

import { MapEditorContext } from "./context"
import { PageContext } from "../page/context.js";

import MapEditorFormat from "./mapeditor.format"

import MapEditor from "./MapEditor"
import MapViewer from "./MapEditor/MapViewer"

const usePage = () => React.useContext(PageContext);

const mapeditorConfig = ({
	app, type,
	siteType,
	baseUrl,
	pattern,
	authPermissions,
  API_HOST,
  pgEnv,
	...rest
}) => {

  baseUrl = baseUrl === '/' ? '' : baseUrl;

	const format = cloneDeep(MapEditorFormat);
  format.app = app;
  format.type = type;

	return {
		siteType,
		format,
		baseUrl,
  	API_HOST,
		children: [
			{ action: "list",
				path: "/*",
				authPermissions,
				type: ({ user, params, children }) => {

					const { falcor, falcorCache } = useFalcor();
					const { pageState, setPageState } = React.useContext(PageContext) || {};

					const mapeditorContextValue = React.useMemo(() => {
						return {
							app, type,
							siteType,
							baseUrl,
							user,
							pgEnv,
							falcor,
							falcorCache,
							pageState,
							setPageState,
							params
						}
					}, [app, type, siteType, baseUrl, user, pgEnv,
							params, falcor, falcorCache, pageState
					]);

					return (
						<MapEditorContext.Provider value={ mapeditorContextValue }>
							{ children }
						</MapEditorContext.Provider>
					)
				},
				children: [
						{ action: "list",
							path: "",
							type: MapEditor,
							filter: {
								attributes: ["name", "description"]
							}
						},
						{ action: "edit",
							path: "edit/:id",
							type: MapEditor
						},
						{ action: "view",
							path: "view/:id",
							type: MapViewer
						}
				]
			}
		]
	}
}
export default [mapeditorConfig];