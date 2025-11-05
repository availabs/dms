import CreatePage from "../gis_dataset/pages/Create";
import Table from "../gis_dataset/pages/Table";
// import Uploads from "./pages/Uploads";

// import { getAttributes } from 'pages/DataManager/components/attributes'



const GisDatasetConfig = {
  table: {
    name: "Table",
    path: "/table",
    component: Table,
  },
  // This key is used to filter in src/pages/DataManager/Source/create.js
  sourceCreate: {
    name: "Create",
    component: CreatePage,
  },
  // add_version: {
  //   name: "Add Version",
  //   path: "/add_version",
  //   component: CreatePage,
  // }
};

export default GisDatasetConfig;
