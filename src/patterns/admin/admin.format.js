import PatternList from './components/patternList'
import TemplateList from "../forms/components/templateList";


export const pattern = {
  app: "admin",
  type: "pattern",
  registerFormats: [],
  attributes: [
      // we need a type for this?
    { key: "pattern_type",
      type: "select",
      required: true,
      default: "page",
        options: [
        {value: 'page', label: 'Page'},
        {value: 'forms', label: 'Forms'}
      ],
    },
    // uuid string to identify pattern entries in db
    { key: "doc_type",
      placeholder: 'Doc Type',
      type: "text",
      required: true
    },
    { key: "base_url",
      placeholder: 'Base URL',
      type: "text",
      required: true
    },
    { key: "subdomain",
      placeholder: 'Subdomain',
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
    { key: 'theme',
      placeholder: '',
      type: 'config'
    },
    {
      key: 'templates',
      // type: 'form-template',
      type: 'dms-format',
      isArray: true,
      format: 'admin+template',
      DisplayComp: TemplateList
    },
  ] 
}

const patternAdminFormat = {
  app: "admin",
  type: "pattern-admin",
  registerFormats: [pattern],
  attributes: [
    
    // if is generated by template or is template -99
    {
      key: 'site_name',
      placeholder: 'Site Name',
      type: "text",
      hidden: true
    },    
    //content
    {
      key: 'patterns',
      type: 'dms-format',
      isArray: true,
      format: 'admin+pattern',
      DisplayComp: PatternList
    },
  ]
}



export default patternAdminFormat