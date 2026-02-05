import React, {useContext, useEffect, useState} from "react";
import { DatasetsContext } from '../../../../context';
import { getExternalEnv } from '../../../../utils/datasources';
import SourcesLayout from "../../../layout";
import Upload from "../../../../components/upload";
import {ThemeContext} from "../../../../../../ui/useTheme";
import {getSourceData} from "../../default/utils";

const CreateInternalDataset = ({
    apiUpdate,
    apiLoad,
    format,
    source,
    params,
    isDms,
}) => {
    const {id, view_id} = params;
    const { API_HOST, baseUrl, pageBaseUrl, user, falcor, datasources } = React.useContext(DatasetsContext) || {};
    const pgEnv = getExternalEnv(datasources);
    const {theme} = useContext(ThemeContext) || {};
    if(!isDms) return <></>
    return (
            <div className={`${theme?.page?.wrapper1}`}>

                  <button className={'p-1 mx-1 bg-blue-300 hover:bg-blue-500 text-white'}
                          disabled={!data.name}
                          onClick={async () => {
                              const clonedData = cloneDeep(source);
                              delete clonedData.id;
                              delete clonedData.views;
                              clonedData.doc_type = crypto.randomUUID();
                              await updateData({sources: [...(sources || []).filter(s => s.type === `${type}|source`), clonedData]})
                              window.location.reload()
                          }}
                  >add</button>
                  <button className={'p-1 mx-1 bg-red-300 hover:bg-red-500 text-white'}
                          onClick={() => {
                              setData({name: ''})
                              setIsAdding(false)
                          }}
                  >cancel</button>

            </div>
    )
}

export default UploadPage
