import React, {useState, useEffect, useContext, useMemo} from 'react'
import {get, cloneDeep} from "lodash-es";
import {useNavigate} from "react-router";
import {DatasetsContext} from "../context";
import {ThemeContext} from "../../../ui/useTheme";
import {buildEnvsForListing} from "../utils/datasources";
import Breadcrumbs from "../components/Breadcrumbs";

const range = (start, end) => Array.from({length: (end + 1 - start)}, (v, k) => k + start);

const getSources = async ({envs, falcor}) => {
    if(!envs || !Object.keys(envs).length) return [];
    const lenRes = await falcor.get(['uda', Object.keys(envs), 'sources', 'length']);

    const sources = await Promise.all(
        Object.keys(envs).map(async e => {
            const len = get(lenRes, ['json', 'uda', e, 'sources', 'length']);
            if(!len) return [];

            const r = await falcor.get(['uda', e, 'sources', 'byIndex', {from: 0, to: len - 1}, envs[e].srcAttributes]);
            const valueGetter = (i, attr) => get(r, ['json', 'uda', e, 'sources', 'byIndex', i, attr]);
            return range(0, len-1).map(i => ({
                ...envs[e].srcAttributes.reduce((acc, attr) => ({...acc, [attr]: valueGetter(i, attr)}), {}),
                source_id: get(r, ['json', 'uda', e, 'sources', 'byIndex', i, '$__path', 4]),
            }));
        }));
    return sources.flat();
}

export default function CreatePage({apiUpdate, format}) {
    const ctx = useContext(DatasetsContext);
    const {baseUrl, user, falcor, type, parent, damaDataTypes, datasources, UI} = ctx;
    const {theme: fullTheme} = useContext(ThemeContext) || {};
    const theme = fullTheme?.datasets?.createPage || {};
    const {Layout, LayoutGroup, Select, Input, Button} = UI;
    const navigate = useNavigate();

    const [data, setData] = useState({name: ''});
    const [sources, setSources] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const envs = useMemo(() => buildEnvsForListing(datasources, format), [datasources, format]);

    useEffect(() => {
        getSources({envs, falcor}).then(setSources);
    }, [format?.app]);

    const ExternalComp = damaDataTypes[data?.type]?.sourceCreate?.component;

    const selectOptions = [
        {label: 'Create new', value: ''},
        ...(sources || []).filter(s => s.doc_type).map(s => ({label: `${s.name} (${s.doc_type})`, value: s.id})),
        ...Object.keys(damaDataTypes).map(k => ({label: k, value: k})),
    ];

    const handleSelectChange = (e) => {
        const val = e.target.value;
        const matchingSource = sources.find(s => s.id === val);
        if (matchingSource) {
            const numCopies = sources.filter(s => s.doc_type?.includes(`${matchingSource.doc_type}_copy_`)).length;
            const clone = cloneDeep(matchingSource);
            clone.name = `${clone.name} copy (${numCopies + 1})`;
            setData(clone);
        } else if (damaDataTypes[val]) {
            setData({...data, type: val});
        } else {
            setData({name: ''});
        }
    };

    const handleCreate = async () => {
        if (!data.name || submitting) return;
        setSubmitting(true);
        try {
            const newData = cloneDeep(data);
            delete newData.id;
            delete newData.views;
            newData.doc_type = crypto.randomUUID();
            await apiUpdate({
                data: {...parent, sources: [...(sources || []).filter(s => s.type === `${type}|source`), newData]},
                config: {format}
            });
            navigate(baseUrl || '/');
        } catch (e) {
            console.error('Error creating dataset:', e);
            setSubmitting(false);
        }
    };

    const breadcrumbItems = [
        {icon: 'Database', href: baseUrl},
        {name: 'Create'},
    ];

    return (
        <Layout navItems={[]}>
            <div className={theme.pageWrapper || 'max-w-4xl mx-auto w-full'}>
                <Breadcrumbs items={breadcrumbItems}/>
                <LayoutGroup>
                    <div className={theme.heading || 'text-2xl font-medium text-blue-600'}>
                        Create Dataset
                    </div>
                    <div className={theme.form || 'flex flex-col gap-4 mt-4'}>
                        <div>
                            <label className={theme.fieldLabel || 'text-sm font-medium text-gray-700'}>Type</label>
                            <Select
                                options={selectOptions}
                                value={data.id || data.type || ''}
                                onChange={handleSelectChange}
                            />
                        </div>
                        <div>
                            <label className={theme.fieldLabel || 'text-sm font-medium text-gray-700'}>Name</label>
                            <Input
                                value={data.name}
                                placeholder={'Dataset name'}
                                onChange={e => setData({...data, name: e.target.value})}
                            />
                        </div>

                        {!ExternalComp ? (
                            <div className={theme.actions || 'flex gap-2 mt-2'}>
                                <Button
                                    disabled={!data.name || submitting}
                                    onClick={handleCreate}
                                >{submitting ? 'Creating...' : 'Create'}</Button>
                                <Button
                                    type="plain"
                                    onClick={() => navigate(baseUrl || '/')}
                                >Cancel</Button>
                            </div>
                        ) : (
                            <div className={theme.externalWrapper || 'mt-6'}>
                                <ExternalComp context={DatasetsContext} source={data}/>
                            </div>
                        )}
                    </div>
                </LayoutGroup>
            </div>
        </Layout>
    )
}
