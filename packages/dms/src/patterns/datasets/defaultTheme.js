import { breadcrumbsTheme } from './components/Breadcrumbs.theme'
import { datasetsListTheme } from './pages/DatasetsList/datasetsList.theme'
import { categoriesTheme } from './pages/DatasetsList/categories.theme'
import { metadataCompTheme } from './components/MetadataComp/metadataComp.theme'
import { validateCompTheme } from './components/validateComp.theme'
import { externalVersionControlsTheme } from './components/ExternalVersionControls.theme'
import { uploadTheme } from './components/upload.theme'
import { sourceOverviewTheme } from './pages/dataTypes/default/sourceOverview.theme'
import { adminTheme } from './pages/dataTypes/default/admin.theme'
import { versionTheme } from './pages/dataTypes/default/version.theme'
import { internalPagesTheme } from './pages/dataTypes/internal/pages/internalPages.theme'
import { sourcePageTheme } from './pages/sourcePage.theme'
import { createPageTheme } from './pages/createPage.theme'
import { settingsPageTheme } from './pages/settingsPage.theme'
import { udaTaskPageTheme } from './pages/Tasks/UdaTaskPage.theme'
import { udaTaskListTheme } from './pages/Tasks/UdaTaskList.theme'
import { errorPageTheme } from './pages/dataTypes/default/errorPage.theme'
import { createPageTheme as fileUploadCreateTheme } from './pages/dataTypes/file_upload/CreatePage.theme'
import { gisCreateTheme } from './pages/dataTypes/gis_dataset/pages/Create/gisCreate.theme'
import { gisMapTheme } from './pages/dataTypes/gis_dataset/pages/Map/gisMap.theme'
import { gisPagesTheme } from './pages/dataTypes/gis_dataset/pages/gisPages.theme'
import { uploadsTheme } from './pages/dataTypes/gis_dataset/pages/Uploads/uploads.theme'
import { changeHistoryEditorTheme } from './components/ChangeHistoryEditor.theme'
import { runsPageTheme } from './pages/dataTypes/schedule/runsPage.theme'
import { schedulePageTheme } from './pages/dataTypes/schedule/schedulePage.theme'

export default {
    breadcrumbs: breadcrumbsTheme,
    datasetsList: datasetsListTheme,
    categories: categoriesTheme,
    metadataComp: metadataCompTheme,
    validateComp: validateCompTheme,
    externalVersionControls: externalVersionControlsTheme,
    upload: uploadTheme,
    sourceOverview: sourceOverviewTheme,
    version: versionTheme,
    internalPages: internalPagesTheme,
    datasetsAdmin: adminTheme,
    sourcePage: sourcePageTheme,
    createPage: createPageTheme,
    settingsPage: settingsPageTheme,
    udaTaskPage: udaTaskPageTheme,
    udaTaskList: udaTaskListTheme,
    errorPage: errorPageTheme,
    fileUploadCreate: fileUploadCreateTheme,
    gisCreate: gisCreateTheme,
    gisMap: gisMapTheme,
    gisPages: gisPagesTheme,
    uploads: uploadsTheme,
    changeHistoryEditor: changeHistoryEditorTheme,
    runsPage: runsPageTheme,
    schedulePage: schedulePageTheme,
}
