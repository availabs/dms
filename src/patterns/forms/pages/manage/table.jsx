import React, {useContext, useEffect, useState} from "react";
import { FormsContext } from '../../'
import SourcesLayout from "../../components/selector/ComponentRegistry/patternListComponent/layout";
import Spreadsheet from "../../components/selector/ComponentRegistry/spreadsheet";

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
    const { API_HOST, baseUrl, theme, user, ...rest } = React.useContext(FormsContext) || {};
    const dmsServerPath = `${API_HOST}/dama-admin`;

    const {app, type, config} = parent;
    const columns = JSON.parse(config || '{}')?.attributes || [];

    return (
        <SourcesLayout fullWidth={false} baseUrl={baseUrl} isListAll={false} hideBreadcrumbs={false}
                       form={{name: format.type, href: format.url_slug}}
                       page={{name: 'Table', href: `${baseUrl}/manage/table`}}>
            <div className={`${theme?.page?.wrapper1} overflow-auto`}>
                <Spreadsheet.ViewComp
                    onChange={() => {}}
                    size={1}
                    format={format}
                    apiLoad={apiLoad}
                    apiUpdate={apiUpdate}
                    value={JSON.stringify({
                        allowEditInView: false,
                        visibleAttributes: columns.map(col => col.name).slice(0, 5),
                        attributes: columns
                    })}
                />
            </div>
        </SourcesLayout>

    )
}

export default TableView