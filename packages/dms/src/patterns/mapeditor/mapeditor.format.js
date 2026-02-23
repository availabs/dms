const mapeditorFormat = {
  app: "dms-site",
  type: "map-symbology",
  attributes: [
    { key: "name", type: "text", required: true, default: "New Map" },
    { key: "description", type: "text" },
    { key: "symbology", type: "json", default: "{}" },
    { key: "categories", type: "text", isArray: true }
  ]
}

export default mapeditorFormat;