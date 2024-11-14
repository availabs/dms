export const view = {
  app: "forms",
  type: "view",
  attributes: [
    { key: "name",
      placeholder: 'Name',
      type: "text",
      required: false
    }
  ] 
}

export const source = {
  app: "forms",
  type: "source",
  registerFormats: [view],
  attributes: [
    { key: "name",
      placeholder: 'Name',
      type: "text",
      required: false
    },
      { key: "doc_type",
      placeholder: 'Doc Type',
      type: "text",
      required: true
    },
    {
      key: "authLevel",
      placeholder: "-1",
      type: "text",
      required: true
    },
    { key: 'config',
      placeholder: 'please select a type',
      type: 'config'
    },
    { key: "description",
      placeholder: 'Description',
      type: "lexical",
      required: true
    },
    { key: "categories",
      placeholder: 'Categories',
      type: "text",
      required: true
    },
    {
      key: 'views',
      type: 'dms-format',
      isArray: true,
      format: 'forms+view',
    },
  ]
}

const formsFormat = {
    app: "forms",
    type: "form-manager",
    registerFormats: [source],
    attributes: [
        {
            key: 'name',
            placeholder: 'Name',
            type: "text",
            hidden: true
        },
        {
            key: 'sources',
            type: 'dms-format',
            isArray: true,
            format: 'forms+source',
        },
    ]
}

export default formsFormat