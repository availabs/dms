import CreatePage from "./CreatePage";
import ViewPage from "./ViewPage"

const FileUploadConfig = {
  sourceCreate: {
    name: "Create",
    component: CreatePage,
  },
  view: {
    name: "View",
    path: "/view",
    component: ViewPage
  }
};

export default FileUploadConfig;