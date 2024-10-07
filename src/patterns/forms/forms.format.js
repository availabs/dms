import PatternList from "../admin/components/patternList";
import {pattern, template, templateSection} from "../admin/admin.format";
// meta format to forms. it only has other form patterns as children
// should have hard coded pages:
const formsFormat = {
    app: "admin",
    type: "pattern-admin",
    registerFormats: [pattern, template, templateSection],
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
            format: 'admin+pattern',
            DisplayComp: PatternList
        },
    ]
}

export default formsFormat