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

    const config = getConfig({
        app,
        type: 'pattern',
        filter: {[`data->>'pattern_type'`]: ['form'], id: existingPatterns}
    })
    return await apiLoad(config);

}


export const FormsSelector = ({app, siteType, formatFromProps, format, setFormat, apiLoad}) => {
    const [forms, setForms] = useState([]);
    console.log('props passed', app, siteType, formatFromProps, format)
    if(formatFromProps?.config) return null;

    useEffect(() => {
        getForms({app, siteType, apiLoad}).then(data => setForms((data || [])));
    }, []);
    console.log('forms', format)
    return (
        <select
            className={'p-1 w-full bg-white border'}
            value={JSON.stringify(format)}
            onChange={e => {
                console.log('val', e.target.value)
                const tmpFormat = JSON.parse(e.target.value || '{}');
                // add type, as we only get doc_type here.
                setFormat({...tmpFormat, type: tmpFormat.type || tmpFormat.doc_type})
            }}
        >
            <option key={'default'} value={undefined}>Please Select a form</option>
            {
                forms.map(form => <option key={form?.data?.value.doc_type} value={JSON.stringify(form?.data?.value || {})}>{form?.data?.value.doc_type}</option>)
            }

        </select>
    )
}