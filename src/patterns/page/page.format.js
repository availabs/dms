import SectionArray from './layout/sectionArray'
//import femaReqs from './data/fema-requirement-tags'

export const cmsSection = {
  app: "dms-site",
  type: "cms-section",
  attributes: [
    { key: "title",
      type: "text",
      required: false,
      default: "Untitled Section"
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
  ] 
}

const cmsPageFormat = {
  app: "dms-site",
  type: "docs-page",
  registerFormats: [cmsSection],
  defaultSearch: `data ->> 'index' = '0' and data ->> 'parent' = ''`,
  defaultSort: (d) => d.sort((a,b) => {
   return (b.parent===null)-(a.parent===null) || a.index - b.index || +a.parent - +b.parent
  }),
  attributes: [
    { key: "title",
      type: "text",
      required: true,
      default: "New Page"
    },
    {
      key: "show_in_nav",
      type: "text",
      default: "true"
    },
    {
      key: "index",
      type: "number",
      default: "props:index",
      editable: false,
      hidden: true
    },
    {
      key: "parent",
      type: "text",
      default: "",
      editable: false,
      hidden: true
    },
    {
      key: 'url_slug',
      type: "text",
      matchWildcard: true,
      hidden: true
    },
    {
      key: 'sidebar',
      type: "text",
      hidden: true
    },
    {
      key: 'header',
      type: "text",
      hidden: true
    },
    {
      key: 'footer',
      type: "text",
      hidden: true
    },
    {
      key: 'draft',
      type: 'text',
      default: "draft"
    },
    {
      key: 'sections',
      type: 'dms-format',
      isArray: true,
      format: 'dms-site+cms-section',
      DisplayComp: SectionArray
    }
  ]
}

export default cmsPageFormat