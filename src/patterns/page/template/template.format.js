import SectionArray from '../sections/sectionArray'
import { cmsSection } from '../page.format.js'

const cmsPageFormat = {
  app: "dms-site",
  type: "format-page",
  registerFormats: [cmsSection],
  attributes: [
    { key: "title",
      type: "text",
      required: true,
      default: "New Page"
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
      hidden: true
    },
    {
      key: 'sidebar',
      type: "text",
      hidden: true
    },
    {
      key: 'sections',
      type: 'dms-format',
      isArray: true,
      format: 'dms-site+cms-section',
      DisplayComp: SectionArray
    },
    {
      key: 'data_controls',
      type: "text",
      hidden: true
    },
    {
      'key': 'generated-pages',
      type: 'text',
      isArray: true
    }
  ]
}

export default cmsPageFormat