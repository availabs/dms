import React, {useEffect, useState} from "react";
import _ from "lodash";


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

// get forms, and their sources
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

const getViews = async ({app, source, apiLoad}) => {
    const views = (source.views || []);
    if(!views.length) return;

    const viewIds = views.map(source => source.id);
    const viewRef = (views[0]?.ref || '').split('+');

    const viewConfig = getConfig({
        app,
        type: viewRef[1],
        filter: {id: viewIds}
    })
    const viewRes = await apiLoad(viewConfig);
    return viewRes.map(({id, data}) => ({id, name: data?.value?.name}))
}


export const FormsSelector = ({app, siteType, formatFromProps, format, setFormat, view, setView, apiLoad}) => {
    const [forms, setForms] = useState([]);
    const [existingFormat, setExistingFormat] = useState(format);
    const [views, setViews] = useState([]);
    const [currentView, setCurrentView] = useState(view);
    if(formatFromProps?.config) return null;

    useEffect(() => {
        getForms({app, siteType, apiLoad}).then(data => {
            setForms((data || []))
            const existingFormat = data.find(form => form.id === format.id)?.data?.value;
            console.log('existing format', existingFormat)
            setExistingFormat(existingFormat)
        });
    }, [app, siteType]);

    useEffect(() => {
        // if source changes, get views
        getViews({app, source: existingFormat, apiLoad}).then(v => {
            setViews(v)
            if(v?.length === 1) setCurrentView(v?.[0]?.id)
        })
    }, [existingFormat])

    useEffect(() => {
        // if view changes, update type and set format
        if(!currentView) return;

        // const type = `${existingFormat.type || existingFormat.doc_type}-${currentView}`
        // const doc_type = `${existingFormat.doc_type}-${currentView}`
        // setFormat({...existingFormat, type, doc_type})
        setView(currentView)
    }, [currentView])
    return (
        <div className={'flex w-full bg-white my-1'}>
            <label className={'p-1'}>Source: </label>
            <select
                className={'p-1 w-full bg-white border'}
                value={JSON.stringify(existingFormat)}
                onChange={e => {
                    const tmpFormat = JSON.parse(e.target.value || '{}');
                    // add type, as we only get doc_type here.
                    setExistingFormat({...tmpFormat, type: tmpFormat.type || tmpFormat.doc_type})
                    setFormat({...tmpFormat, type: tmpFormat.type || tmpFormat.doc_type})
                }}
            >
                <option key={'default'} value={undefined}>Please Select a source</option>
                {
                    forms.map(form => <option key={form?.data?.value.doc_type}
                                              value={JSON.stringify(form?.data?.value || {})}>{form?.data?.value.doc_type}</option>)
                }

            </select>

            <select
                className={'p-1 w-full bg-white border'}
                value={currentView}
                onChange={e => setCurrentView(e.target.value)}
            >
                <option key={'default'} value={undefined}>Please Select a view</option>
                {
                    (views || []).map(view => <option key={view.id} value={view.id}>{view.name}</option>)
                }
            </select>
        </div>
    )
}