import React, {useContext, useMemo} from "react";
import {CMSContext, ComponentContext} from "../../page/context"
import { FormsContext } from '../siteConfig'
import ValidateComp from "../components/validate"
import SourcesLayout from "../components/patternListComponent/layout";
import {ThemeContext} from "../../../ui/useTheme";

const Validate = ({item, params,  apiUpdate, apiLoad}) => {
    const { API_HOST, baseUrl, pageBaseUrl, user, falcor } = React.useContext(FormsContext) || {};
    const {theme} = useContext(ThemeContext) || {};
    const {config} = item;
    const is_dirty = (JSON.parse(config || '{}')?.is_dirty);
    const page = useMemo(() => ({name: 'Validate', href: `${pageBaseUrl}/${params.id}/validate`, /*warn: is_dirty*/}), [is_dirty, pageBaseUrl, params.id])
    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: item.url_slug}}
                       page={page}
                       id={params.id} //page id to use for navigation
                       view_id={params.view_id}
                       views={item.views}
                       showVersionSelector={true}

        >
                {
                    !params.view_id || params.view_id === 'undefined' ? 'Please select a version' :
                        <ValidateComp.EditComp
                            API_HOST={API_HOST} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} theme={theme} user={user} falcor={falcor}
                            item={{...item, view_id: params.view_id, source_id: params.id, default_columns: item.default_columns || item.defaultColumns}}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                            cms_context={FormsContext}
                        />
                }
        </SourcesLayout>
    )
}

export default Validate