import React, {useEffect} from "react";
import { DatasetsContext } from '../../../../context'
// import SourcesLayout from "../../../layout";
import MetadataComp from "../../../../components/MetadataComp";
import {updateSourceData} from "../../default/utils";

export default function ManageForm ({
    status,
    apiUpdate,
    format,
    source, setSource,
    params,
    apiLoad,
    isDms,
}) {
    const {id} = params;
    const { baseUrl, pageBaseUrl, theme, falcor, pgEnv } = React.useContext(DatasetsContext) || {}

    return (
      <div className={`${theme?.page?.wrapper1}`}>
        <div className={'overflow-auto flex flex-1 w-full flex-col shadow bg-white relative text-md font-light leading-7 p-4'}>
            {status ? <div>{JSON.stringify(status)}</div> : ''}
            <div className='w-full'>
                <MetadataComp
                    isDms={isDms}
                    value={isDms ? source?.config : source?.metadata}
                    accessKey={isDms ? 'attributes' : 'columns'}
                    onChange={(v) => {
                        console.log('updated data', v)
                        updateSourceData({data: v, attrKey: isDms ? 'config' : 'metadata', isDms, apiUpdate, setSource, format, source, pgEnv, falcor, id})
                    }}
                    apiLoad={apiLoad}
                    format={format}
                />
            </div>
        </div>
      </div>
    )
}
