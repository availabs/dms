import CreatePage from "./CreatePage";

// No `view` page and no `defaultPages`: an uploaded file has nothing to table, map or describe.
// Its artifact is surfaced by the Versions card on the source Overview, which reads the upload's
// `file.dl_url` (`data.file` for DMS rows, `metadata.file` for pgEnv rows) alongside any generated
// `download` map — see dataTypes/default/overview.jsx `downloadItemsForView`.
const FileUploadConfig = {
  sourceCreate: {
    name: "Create",
    component: CreatePage,
  },
};

export default FileUploadConfig;
