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
import CreatePage from "./pages/CreatePage";
import SettingsPage from "./pages/SettingsPage";
import SourcePage from "./pages/SourcePage";
import UdaTasks from "./pages/Tasks/UdaTasks";
import UdaTaskPage from "./pages/Tasks/UdaTaskPage";

// datasets -- move to library/registry import
import csv_dataset from "./pages/dataTypes/csv_dataset";
import gis_dataset from "./pages/dataTypes/gis_dataset";
import internal_table from "./pages/dataTypes/internal_table";

import file_upload from "./pages/dataTypes/file_upload"

const datasetsConfig = ({
    app,
    type,
    siteType,
    baseUrl,
    datasources,
    dmsEnvs = [],
    dmsEnvById = {},
    Menu,
    API_HOST='https://graph.availabs.org',
    DAMA_HOST='https://graph.availabs.org',
    authPermissions,
    pattern,
    damaDataTypes,
    themes={ default: {} },
    useFalcor,
    ...props
}) => {
    const theme = getPatternTheme(themes, pattern)
    const patternFormat = initializePatternFormat(datasetsFormat, app, type);
    baseUrl = baseUrl === '/' ? '' : baseUrl;

// console.log("siteConfig::props", props)

    return {
        siteType,
        format: patternFormat,
        baseUrl: `${baseUrl}`,
        API_HOST,
        children: [
            {
              type: (props) => {
                  const { user, falcor, ...otherProps } = props

// console.log("siteConfig::otherProps", otherProps)

                  return (
                      <DatasetsContext.Provider value={{
                          UI,
                          datasources,
                          dmsEnvs, dmsEnvById,
                          dmsEnv: pattern.dmsEnvId ? dmsEnvById[pattern.dmsEnvId] : null,
                          baseUrl: `${baseUrl}`,
                          falcor,
                          useFalcor,
                          user,
                          theme, app, type, siteType,
                          parent: pattern, API_HOST, DAMA_HOST,
                          authPermissions,
                          damaDataTypes: {
                            csv_dataset,
                            gis_dataset,
                            internal_table,
                            file_upload,
                            ...damaDataTypes
                          },
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
                        type: props => <CreatePage {...props} />,
                        path: "create",
                        action: "edit"
                    },
                    {
                        type: props => <SettingsPage {...props} />,
                        path: "settings",
                        action: "view"
                    },
                    {
                        type: props => <UdaTasks {...props} />,
                        path: "tasks",
                        action: "view"
                    },
                    {
                        // UdaTaskPage reads both `params.task_id` and the
                        // legacy `params.etl_context_id` (they're the same
                        // id after the task-port migration preserved ids).
                        type: props => <UdaTaskPage {...props} />,
                        path: "task/:task_id",
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
