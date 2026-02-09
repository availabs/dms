import React from "react"
// setup
import datasetsFormat from "./datasets.format";
import { DatasetsContext } from "./context";
import { ThemeContext, getPatternTheme } from "../../ui/useTheme";
import { initializePatternFormat } from "../../dms-manager/_utils";
import { isUserAuthed } from "./auth";
import UI from "../../ui"

// pages
import ErrorPage from "./pages/dataTypes/default/error";
import DatasetsList from "./pages/DatasetsList"
import SourcePage from "./pages/SourcePage";
import Tasks from "./pages/dataTypes/default/Tasks/";
import TaskPage from "./pages/dataTypes/default/Tasks/TaskPage";

// datasets -- move to library/registry import
import csv_dataset from "./pages/dataTypes/csv_dataset";
import gis_dataset from "./pages/dataTypes/gis_dataset";
import internal_dataset from "./pages/dataTypes/internal";

const datasetsConfig = ({
    app,
    type,
    siteType,
    baseUrl,
    datasources,
    Menu,
    API_HOST='https://graph.availabs.org',
    DAMA_HOST='https://graph.availabs.org',
    authPermissions,
    pattern,
    damaDataTypes,
    themes={ default: {} },
}) => {
    const theme = getPatternTheme(themes, pattern)
    const patternFormat = initializePatternFormat(datasetsFormat, app, type);
    baseUrl = baseUrl === '/' ? '' : baseUrl

    return {
        siteType,
        format: patternFormat,
        baseUrl: `${baseUrl}`,
        API_HOST,
        children: [
            {
              type: (props) => {
                  const { user, falcor } = props
                  return (
                      <DatasetsContext.Provider value={{
                          UI,
                          datasources,
                          baseUrl: `${baseUrl}`,
                          falcor,
                          user,
                          theme, app, type, siteType,
                          parent: pattern, API_HOST, DAMA_HOST,
                          authPermissions,
                          damaDataTypes: { csv_dataset, gis_dataset, internal_dataset, ...damaDataTypes },
                          isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({ user, authPermissions: customAuthPermissions || authPermissions, reqPermissions }),
                      }}>
                          <ThemeContext.Provider value={{ theme, UI }}>
                              {props.children}
                          </ThemeContext.Provider>
                      </DatasetsContext.Provider>
                  )
                },
                authPermissions,
                reqPermissions: ['view-sources'],
                action: "list",
                filter: {
                    stopFullDataLoad: true,
                    fromIndex: () => 0,
                    toIndex: () => 0,
                },
                path: "/*",
                children: [
                    {
                        type: props => <DatasetsList {...props} />,
                        path: "",
                        action: "view"
                    },
                    {
                        type: props => <Tasks {...props} />,
                        path: "tasks",
                        action: "view"
                    },
                    {
                        type: props => <TaskPage {...props} />,
                        path: "task/:etl_context_id",
                        action: "view"
                    },
                    {
                        type: SourcePage,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'view',
                        path: `source/:id/:page?/:view_id?`
                    },
                    {
                        type: props => <SourcePage {...props} isDms={true} />,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `internal_source/:id/:page?/:view_id?`
                    }
                ]
            }
        ],
        errorElement: () => (
          <ThemeContext.Provider value={{ theme, UI }}>
              <ErrorPage />
          </ThemeContext.Provider>
        ),
    }
}

export default [datasetsConfig];
