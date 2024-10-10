import PatternList from "../admin/components/patternList";
import {pattern, template, templateSection} from "../admin/admin.format";
// meta format to forms. it only has other form patterns as children
// should have hard coded pages:
export const source = {
  app: "forms",
  type: "source",
  attributes: [
      // we need a type for this?
    
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
    }
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
        //content
        {
            key: 'sources',
            type: 'dms-format',
            isArray: true,
            format: 'forms+source'
        },
    ]
}

export default formsFormat