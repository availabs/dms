import React, {useEffect, useState} from "react";


const getConfig = ({
                       app,
                       type,
                       filter,
                       action = 'load',
                       tags,
                       attributes = [
                           {key: 'id', label: 'id'},
                           {key: 'app', label: 'app'},
                           {key: 'type', label: 'type'},
                           {key: 'data', label: 'data'},
                           {key: 'updated_at', label: 'updated_at'},
                       ]}) => ({
    format: {
        app: app,
        type: type,
        attributes
    },
    children: [
        {
            type: () => {},
            action,
            filter: {
                options: JSON.stringify({
                    filter,
                }),
                tags,
                attributes: attributes.map(a => a.key)
            },
            path: '/'
        }
    ]
})

const getForms = async ({app, siteType, apiLoad}) => {
    const siteConfig = getConfig({
        app,
        type: siteType,
    })

    // these are the patterns which are in the site.
    // there may be deleted patterns which are not in the site.patterns array. don't wanna show them :shrug:

    const siteData = await apiLoad(siteConfig);

    // these are the patterns which are in the site.
    // there may be deleted patterns which are not in the site.patterns array. don't wanna show them :shrug:
    const existingPatterns = (siteData?.[0]?.data?.value?.patterns || []).map(p => p.id)

    const formPatternConfig = getConfig({
        app,
        type: 'pattern',
        filter: {[`data->>'pattern_type'`]: ['forms'], id: existingPatterns}
    })
    const forms = await apiLoad(formPatternConfig); // these are the meta forms patterns holding sources.
    const sources = forms.reduce((acc, form) => [...acc, ...(form.data.value.sources || [])] , []);
    if(!sources.length) return;

    const sourceIds = sources.map(source => source.id);
    const sourceRef = (sources[0]?.ref || '').split('+');

    const sourceConfig = getConfig({
        app,
        type: sourceRef[1],
        filter: {id: sourceIds}
    })
    return await apiLoad(sourceConfig);

}


export const FormsSelector = ({app, siteType, formatFromProps, format, setFormat, apiLoad}) => {
    const [forms, setForms] = useState([]);

    if(formatFromProps?.config) return null;

    useEffect(() => {
        getForms({app, siteType, apiLoad}).then(data => setForms((data || [])));
    }, []);

    return (
        <div className={'flex w-full bg-white my-1'}>
            <label className={'p-1'}>Source: </label>
            <select
                className={'p-1 w-full bg-white border'}
                value={JSON.stringify(format)}
                onChange={e => {
                    const tmpFormat = JSON.parse(e.target.value || '{}');
                    // add type, as we only get doc_type here.
                    setFormat({...tmpFormat, type: tmpFormat.type || tmpFormat.doc_type})
                }}
            >
                <option key={'default'} value={undefined}>Please Select</option>
                {
                    forms.map(form => <option key={form?.data?.value.doc_type}
                                              value={JSON.stringify(form?.data?.value || {})}>{form?.data?.value.doc_type}</option>)
                }

            </select>
        </div>
    )
}