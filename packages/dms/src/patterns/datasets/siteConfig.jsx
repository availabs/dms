import React from "react"
import {Link} from "react-router";
import { merge, cloneDeep } from "lodash-es"
import {DatasetsContext} from "./context";
import datasetsFormat, {source} from "./datasets.format";
import { ThemeContext, getPatternTheme } from "../../ui/useTheme";
import { initializePatternFormat } from "../../dms-manager/_utils";
import defaultTheme from "../../ui/defaultTheme";
import UI from "../../ui"
import ErrorPage from "./pages/dataTypes/default/error";
import DefaultMenu from "./components/menu";
import DatasetsList from "./pages/DatasetsList"
import SourcePageSelector from "./pages/sourcePageSelector";
import Tasks from "./pages/dataTypes/default/Tasks/";
import TaskPage from "./pages/dataTypes/default/Tasks/TaskPage";
import csv_dataset from "./pages/dataTypes/csv_dataset";
import gis_dataset from "./pages/dataTypes/gis_dataset";
import internal_dataset from "./pages/dataTypes/internal";
import { isUserAuthed } from "./auth";
// for instances without auth turned on can edit



const adminConfig = ({
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
  baseUrl = baseUrl === '/' ? '' : baseUrl
  const patternFormat = initializePatternFormat(datasetsFormat, app, type);
    // console.log('formsAdminConfig', patternFormat)
  return {
    siteType,
    format: patternFormat,
    baseUrl: `${baseUrl}`,
    API_HOST,
    children: [
      {
        type: (props) => {
          const { user, falcor, ...rest } = props
          const { Layout } = UI;
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
              Menu: () => <>{Menu || <DefaultMenu theme={theme} UI={UI} />}</>,
              isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({ user, authPermissions: customAuthPermissions || authPermissions, reqPermissions }),
            }}>
              <ThemeContext.Provider value={{ theme, UI }}>
                <Layout navItems={[]} Menu={() => <DefaultMenu theme={theme} UI={UI} />}>
                  {props.children}
                </Layout>
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
            action: "edit"
          },
          {
            type: props => <Tasks {...props} />,
            path: "tasks",
            action: "edit"
          },
          {
            type: props => <TaskPage {...props} />,
            path: "task/:etl_context_id",
            action: "edit"
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


const externalSourceConfig = ({
    app,
    type,
    siteType,
    baseUrl,
    datasources,
    Menu,
    API_HOST='https://graph.availabs.org',
    DAMA_HOST='https://graph.availabs.org',
    authPermissions,
    columns,
    logo,
    pattern,
    themes={ default: {} },
    checkAuth = () => {},
    damaDataTypes = {}
}) => {
    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern?.theme_name] || themes.mny_datasets));

    baseUrl = baseUrl === '/' ? '' : baseUrl

    const patternFormat = initializePatternFormat(source, app, `${type}|source`);

    // console.log('formsAdminConfig', patternFormat)
    return {
        siteType,
        format: patternFormat,
        baseUrl: `${baseUrl}/source`,
        API_HOST,
        children: [
            {
                type: ({user, falcor, children}) => {
                  const {Layout} = UI;
                  return (
                      <DatasetsContext.Provider value={{
                          UI,
                          baseUrl: `${baseUrl}`,
                          pageBaseUrl: `${baseUrl}/source`,
                          datasources,
                          user,
                          theme, app, type, siteType,
                          parent: pattern,
                          Menu: () => <>{Menu || <DefaultMenu theme={theme} UI={UI}/>}</>, API_HOST, DAMA_HOST,
                          falcor,
                          damaDataTypes: {csv_dataset, gis_dataset, internal_dataset, ...damaDataTypes},
                          authPermissions,
                          isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({user, authPermissions: customAuthPermissions || authPermissions, reqPermissions}),
                      }}>
                          <ThemeContext.Provider value={{theme, UI}}>
                                      <Layout navItems={[]} Menu={() => <DefaultMenu theme={theme} UI={UI}/>}>
                                          {children}
                                      </Layout>
                          </ThemeContext.Provider>
                      </DatasetsContext.Provider>
                  )
                },
                authPermissions,
                action: "list",
                filter: {
                    stopFullDataLoad: true,
                    fromIndex: () => 0,
                    toIndex: () => 0,
                },
                path: "/*",
                authLevel: 5,
                children: [
                    {
                        type: SourcePageSelector,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:id/:page?/:view_id?`
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

const internalSourceConfig = ({
    app,
    type,
    siteType,
    adminPath,
    title,
    baseUrl,
    datasources,
    Menu,
    API_HOST='https://graph.availabs.org',
    DAMA_HOST='https://graph.availabs.org',
    authPermissions,
    columns,
    logo,
    pattern,
    themes={ default: {} },
    checkAuth = () => {},
    damaDataTypes
}) => {
    let theme = merge(cloneDeep(defaultTheme), cloneDeep(themes[pattern?.theme_name] || themes.mny_datasets));

    baseUrl = baseUrl === '/' ? '' : baseUrl

    const patternFormat = initializePatternFormat(source, app, `${type}|source`);

    // console.log('formsAdminConfig', patternFormat)
    return {
        siteType,
        format: patternFormat,
        baseUrl: `${baseUrl}/internal_source`,
        API_HOST,
        children: [
            {
                type: ({user, falcor, children}) => {
                  const {Layout} = UI;
                  return (
                      <DatasetsContext.Provider value={{
                          UI,
                          baseUrl: `${baseUrl}`,
                          pageBaseUrl: `${baseUrl}/internal_source`,
                          datasources,
                          user,
                          theme, app, type, siteType,
                          parent: pattern,
                          Menu: () => <>{Menu || <DefaultMenu theme={theme} UI={UI}/>}</>, API_HOST, DAMA_HOST,
                          falcor,
                          damaDataTypes: {csv_dataset, gis_dataset, internal_dataset, ...damaDataTypes},
                          authPermissions,
                          isUserAuthed: (reqPermissions, customAuthPermissions) => isUserAuthed({user, authPermissions: customAuthPermissions || authPermissions, reqPermissions}),
                      }}>
                          <ThemeContext.Provider value={{theme, UI}}>
                                      <Layout navItems={[]} Menu={() => <DefaultMenu theme={theme} UI={UI}/>}>
                                          {children}
                                      </Layout>
                          </ThemeContext.Provider>
                      </DatasetsContext.Provider>
                  )
                },
                authPermissions,
                action: "list",
                filter: {
                    stopFullDataLoad: true,
                    fromIndex: () => 0,
                    toIndex: () => 0,
                },
                path: "/*",
                authLevel: 5,
                children: [
                    {
                        type: props => <SourcePageSelector {...props} isDms={true} />,
                        filter: {
                            stopFullDataLoad: true,
                            fromIndex: () => 0,
                            toIndex: () => 0,
                        },
                        action: 'edit',
                        path: `:id/:page?/:view_id?`
                    }
                ]
            }
      ],
      errorElement: () => (
        <ThemeContext.Provider value={{ theme, UI }}>
          <ErrorPage />
        </ThemeContext.Provider>
      )
    }
}


export default [
    adminConfig,
    externalSourceConfig,
    internalSourceConfig

];
