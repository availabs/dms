import React from "react"

import { cloneDeep } from "lodash-es";

import { useFalcor } from "@availabs/avl-falcor"

import UI from "../../ui"
import { ThemeContext } from "../../ui/themeContext"
import { MapEditorContext } from "./context"

import MapEditorFormat from "./mapeditor.format"

import MapEditor from "./MapEditor"
import MapViewer from "./MapEditor/MapViewer"

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

// console.log("MapEditor::siteConfig::app, type, baseUrl", app, type, baseUrl);

	return {
		siteType,
		format,
		baseUrl,
  	API_HOST,
		children: [
			{ action: "list",
				path: "/*",
				authPermissions,
				type: ({ user, params, children, falcor, dama_falcor }) => {

					// const { falcor, falcorCache } = useFalcor();

					const mapeditorContextValue = React.useMemo(() => {
						return {
							app, type,
							siteType,
							baseUrl,
							user,
							pgEnv,
							falcor: dama_falcor,
							params
						}
					}, [app, type, siteType, baseUrl, user,
							params, falcor, pgEnv
					]);

					return (
						<MapEditorContext.Provider value={ mapeditorContextValue }>
							<ThemeContext.Provider value={{ UI }}>
								{ children }
							</ThemeContext.Provider>
						</MapEditorContext.Provider>
					)
				},
				children: [
						{ action: "list",
							path: "",
							type: MapEditor,
							filter: {
								attributes: ["name"]
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