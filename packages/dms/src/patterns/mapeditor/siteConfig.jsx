import React from "react"

import { falcorGraph, FalcorProvider } from "@availabs/avl-falcor"

import UI from "../../ui"
import { ThemeContext } from "../../ui/themeContext"
import { MapEditorContext } from "./context"

import { initializePatternFormat } from "../../dms-manager/_utils"
import { getInstance } from "../../utils/type-utils"

import MapEditorFormat from "./mapeditor.format"

import MapEditor from "./MapEditor"
import MapViewer from "./MapEditor/MapViewer"

const mapeditorConfig = ({
	app, type: patternType,
	siteType,
	baseUrl,
	pattern,
	authPermissions,
  API_HOST,
  DAMA_HOST,
  pgEnv,
  useFalcor,
	...rest
}) => {

  baseUrl = baseUrl === '/' ? '' : baseUrl;

  const patternInstance = getInstance(patternType) || patternType;
  const format = initializePatternFormat(MapEditorFormat, app, patternInstance);
  const childType = format.type; // e.g. "map_editor_test|symbology"

	return {
		siteType,
		format,
		baseUrl,
  	API_HOST,
		children: [
			{ action: "list",
				path: "/*",
				authPermissions,
				// Outer route is a context wrapper only — it doesn't render
				// symbology data itself. Restrict its data fetch to just
				// `name` so the dms-format loader doesn't pull all 247
				// symbologies' full `data` JSONB (~5MB total) on every page.
				// The inner `edit/view` routes load full data by id.
				filter: {
					attributes: ["name"]
				},
				type: ({ user, params, children }) => {

					const { falcor, falcorCache } = useFalcor();

					const mapeditorContextValue = React.useMemo(() => {
						return {
							app,
							type: childType,
							patternType,
							siteType,
							baseUrl,
							user,
							pgEnv,
							falcor,
							falcorCache,
							useFalcor,
							params
						}
					}, [app, childType, patternType, siteType, baseUrl, user,
							params, falcor, falcorCache, pgEnv
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