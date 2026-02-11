import React from "react"

import { cloneDeep } from "lodash-es";

import { useFalcor } from "@availabs/avl-falcor"

import { MapEditorContext, useMapEditorContext } from "./context"

import MapEditorFormat from "./mapeditor.format"

import UI from "../../ui"
import { ThemeContext, getPatternTheme } from "../../ui/useTheme.js";

import { SymbologyManager } from "./components"

import MapEditor from "./MapEditor"

const useTheme = () => React.useContext(ThemeContext);

const mapeditorConfig = ({
	app, type,
	siteType,
	baseUrl,
	pattern,
	authPermissions,
  API_HOST,
  pgEnv,
	themes={ default: {} },
	...rest
}) => {

  baseUrl = baseUrl === '/' ? '' : baseUrl

	const format = cloneDeep(MapEditorFormat);
  format.app = app;
  format.type = type;

  const theme = getPatternTheme(themes, pattern);

console.log("MapEditor::siteConfig::baseUrl", baseUrl)

	return {
		siteType,
		format,
		baseUrl,
  	API_HOST,
		children: [
			{ action: "list",
				path: "/*",
				authPermissions,
				type: ({ user, params, children, ...props }) => {

					const { falcor, falcorCache } = useFalcor();

					const mapeditorContextValue = React.useMemo(() => {
						return {
							app, type,
							siteType,
							baseUrl,
							user,
							pgEnv,
							falcor,
							falcorCache,
							useTheme,
							params
						}
					}, [app, type, siteType, baseUrl, user, params, falcor, falcorCache]);

					return (
						<MapEditorContext.Provider value={ mapeditorContextValue }>
							<ThemeContext.Provider value={ { theme, UI } }>
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
								attributes: ["name", "description"]
							}
						},
						{ action: "edit",
							path: "edit/:id",
							type: MapEditor
						},
						{ action: "view",
							path: "view/:id",
							type: () => <div>SYMBOLOGY VIEWER</div>
						}
				]
			}
		]
	}
}
export default [mapeditorConfig];