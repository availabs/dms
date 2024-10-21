import React, {useContext, useEffect, useState} from "react";
import { FormsContext } from '../siteConfig'
import SourcesLayout from "../components/selector/ComponentRegistry/patternListComponent/layout";
import Spreadsheet from "../components/selector/ComponentRegistry/spreadsheet";

const TableView = ({
    adminPath,
    status,
    apiUpdate,
    apiLoad,
    attributes={},
    dataItems,
    format,
    item,
    setItem,
    updateAttribute,
    params,
    submit,
    parent,
    manageTemplates = false,
    // ...rest
}) => {
    const [data, setData] = useState({});
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(false);
    const [error, setError] = useState();
    const { API_HOST, baseUrl, pageBaseUrl, theme, user, ...rest } = React.useContext(FormsContext) || {};

    const {app, type, config} = parent;
    const columns = JSON.parse(config || '{}')?.attributes || [];
    console.log('what am i passing', item, format)

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} pageBaseUrl={pageBaseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: item.name || item.doc_type, href: format.url_slug}}
                       page={{name: 'Table', href: `${pageBaseUrl}/${params.id}/table`}}
                       id={params.id} //page id to use for navigation
        >
            {
                !item.config ?
                    <div className={'p-1 text-center'}>Please setup metadata.</div> :
                    <div className={`${theme?.page?.wrapper1} h-full overflow-auto`}>
                        <Spreadsheet.EditComp
                            onChange={() => {
                            }}
                            size={1}
                            format={{app: item.app, type: item.doc_type, config: item.config}}
                            apiLoad={apiLoad}
                            apiUpdate={apiUpdate}
                            value={JSON.stringify({
                                // allowEditInView: false,
                                visibleAttributes: columns.map(col => col.name).slice(0, 5),
                                attributes: columns
                            })}
                        />
                    </div>
            }

        </SourcesLayout>

    )
}

export default TableView