import PatternList from './components/patternList'
import SectionArray from "../forms/components/sections/sectionArray";
import TemplateList from "../forms/components/templateList";

export const templateSection = {
  app: "admin",
  type: "template-section",
  attributes: [
    { key: "title",
      type: "text",
      required: false,
      default: "Untitled Section"
    },
    {
      key: 'is_header',
      type: 'boolean',
      hidden: 'true',
      required: false
    },
    {
      key: "helpText",
      type: "lexical"
    },
    { key: "level",
      type: "select",
      options: [
        {value: '0', label: 'Hidden'},
        {value: '1', label: 'H1'},
        {value: '2', label: 'H2'},
        {value: '3', label: 'H3'},
        {value: '4', label: 'H4'}
      ],
      required: false,
      default: "1"
    },
    { key: "tags",
      type: "text",
      required: false
    },
    { key: "requirements",
      type: "text",
      required: false
    },
    {
      key: "size",
      type: "text"
    },
    { key: "element",
      type: "selector",
      required: false,
    }
  ],
}

export const template = {
  app: "admin",
  type: "template",
  registerFormats: [templateSection],
  attributes: [
    { key: "title",
      type: "text",
      required: true,
      default: "New Page"
    },
    {
      key: 'data_controls',
      type: "text",
      // hidden: true
    },
    {
      key: 'url_slug',
      type: "text",
      // matchWildcard: true,
      // hidden: true
    },
    {
      key: 'main_nav',
      type: "boolean",
    },
    {
      key: 'sections',
      type: 'dms-format',
      isArray: true,
      format: 'admin+template-section',
      DisplayComp: SectionArray
    },
    {
      key: 'draft_sections',
      type: 'dms-format',
      isArray: true,
      format: 'admin+template-section',
      DisplayComp: SectionArray
    },

  ]
}

export const pattern = {
  app: "admin",
  type: "pattern",
  registerFormats: [template],
  attributes: [
      // we need a type for this?
    { key: "pattern_type",
      type: "select",
      required: true,
      default: "page",
        options: [
        {value: 'page', label: 'Page'},
        {value: 'form', label: 'Form'},
        {value: 'forms', label: 'Forms'}
      ],
    },
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
  registerFormats: [pattern, template, templateSection],
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