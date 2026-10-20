import React, {useState, useEffect, useContext, useMemo} from 'react'
import {get, cloneDeep} from "lodash-es";
import {useNavigate} from "react-router";
import {DatasetsContext} from "../context";
import {ThemeContext} from "../../../ui/useTheme";
import {dataItemsNav} from "../../../utils/nav";
import {buildEnvsForListing} from "../utils/datasources";
import { clearDatasetsListCache } from "../utils/datasetsListCache";
import { nameToSlug, getInstance } from "../../../utils/type-utils";
import Breadcrumbs from "../components/Breadcrumbs";
import { createPageTheme } from "./createPage.theme";

// Type-card copy for the v6 card picker. Any registered dataType without an entry gets the generic card.
const TYPE_INFO = {
    '': {label: 'Blank table', icon: 'Add', blurb: 'An empty table — add its columns and rows later.'},
    internal_table: {label: 'Table', icon: 'Table', blurb: 'Rows you edit and upload here — a spreadsheet that lives in the site.'},
    gis_dataset: {label: 'GIS dataset', icon: 'Map', blurb: 'A shapefile, GeoPackage or GeoJSON, published as a table and a map layer.'},
    csv_dataset: {label: 'CSV dataset', icon: 'TableColumns', blurb: 'A CSV or Excel file published as a queryable table.'},
    file_upload: {label: 'File', icon: 'File', blurb: 'Any file — a PDF, a zip — kept as a downloadable artifact.'},
};
const GENERIC_TYPE = {icon: 'Database', blurb: 'A registered loader type — its own create page opens below.'};

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
    const {baseUrl, user, falcor, type, app, parent, damaDataTypes, datasources, dmsEnv, UI} = ctx;
    const {theme: fullTheme} = useContext(ThemeContext) || {};
    const theme = { ...createPageTheme, ...(fullTheme?.datasets?.createPage || {}) };
    const {Layout, LayoutGroup, MultiSelect, Input, Button, Icon, FieldLabel} = UI;
    // Shared secondary nav — mount-aware base (pattern.navPrefix; '' on primary mounts) (see DatasetsList).
    const menuItemsSecondNav = useMemo(
        () => dataItemsNav(fullTheme?.navOptions?.secondaryNav?.navItems || [], ctx?.parent?.navPrefix || '', false),
        [fullTheme?.navOptions?.secondaryNav?.navItems, ctx?.parent?.navPrefix]
    );
    const navigate = useNavigate();

    const [data, setData] = useState({name: ''});
    const [sources, setSources] = useState([]);
    const [submitting, setSubmitting] = useState(false);

    const envs = useMemo(() => buildEnvsForListing(datasources, format, dmsEnv), [datasources, format, dmsEnv]);

    useEffect(() => {
        getSources({envs, falcor}).then(setSources);
    }, [format?.app]);

    const ExternalComp = damaDataTypes[data?.type]?.sourceCreate?.component;

    // known types first, in TYPE_INFO order (the card picker reads top-left to bottom-right)
    const typeOrder = Object.keys(TYPE_INFO);
    const selectOptions = [
        {label: 'Create new', value: ''},
        ...Object.keys(damaDataTypes)
            .sort((a, b) => (typeOrder.indexOf(a) + 1 || 99) - (typeOrder.indexOf(b) + 1 || 99))
            .map(k => ({label: k, value: k})),
    ];

    const handleSelectChange = (val) => {
        if (damaDataTypes[val]) {
            setData({...data, type: val});
        } else {
            // back to "Create new" — keep the name already typed (it used to be wiped)
            setData({name: data.name || ''});
        }
    };

    const handleCreate = async () => {
        if (!data.name || submitting) return;
        setSubmitting(true);
        try {
            const newData = cloneDeep(data);
            delete newData.id;
            delete newData.views;
            const sourceSlug = nameToSlug(data.name);
            if (!sourceSlug) throw new Error('Name must contain at least one letter or number.');
            if (!newData.type) newData.type = 'internal_table';

            // New sources are PRIVATE by default — the creator gets full access; everyone else (and
            // the pattern's public:[view-source] baseline) must be granted intentionally. The empty
            // public:[] revokes the inherited baseline. See datasets-permissions-model.
            newData.auth_permissions = {
                users: user?.id ? { [user.id]: ['*'] } : {},
                groups: { public: [] },
            };

            if (dmsEnv) {
                // New path: create source then add ref to dmsEnv
                const dmsEnvInstance = getInstance(dmsEnv.type);
                const sourceType = `${dmsEnvInstance}|${sourceSlug}:source`;
                const res = await falcor.call(
                    ["dms", "data", "create"],
                    [app, sourceType, newData]
                );
                const newId = Object.keys(res?.json?.dms?.data?.byId || {})
                    .find(k => k !== '$__path');
                if (!newId) throw new Error('Failed to create source');

                const existingRefs = (dmsEnv.sources || [])
                    .filter(s => s.id)
                    .map(s => ({ ref: s.ref, id: s.id }));

                await falcor.call(["dms", "data", "edit"], [app, dmsEnv.id, {
                    sources: [...existingRefs, { ref: `${app}+${dmsEnvInstance}|source`, id: +newId }]
                }]);
                await falcor.invalidate(['dms', 'data', app, 'byId', dmsEnv.id]);
                // Create-specific invalidation: length changed, new byIndex entry
                // appears at the tail. Existing byId rows are still valid, so don't
                // wipe the whole sources subtree.
                await falcor.invalidate(['uda', `${app}+${type}`, 'sources', 'length']);
                await falcor.invalidate(['uda', `${app}+${type}`, 'sources', 'byIndex']);
                clearDatasetsListCache();
            } else {
                // Legacy path: add source to pattern's sources array
                await apiUpdate({
                    data: {...parent, sources: [...(sources || []).filter(s => s.type === `${type}|source`), newData]},
                    config: {format}
                });
                clearDatasetsListCache();
            }
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

    // v6 lays the page out directly; pre-v6 (theme.content '') keeps the LayoutGroup card
    const Body = theme.content ? 'div' : LayoutGroup;
    const bodyProps = theme.content ? {className: theme.content} : {};
    const selectedType = data.id || data.type || '';

    return (
        <Layout navItems={[]} secondNav={menuItemsSecondNav}>
            <div className={theme.pageWrapper}>
                <Breadcrumbs items={breadcrumbItems}/>
                <Body {...bodyProps}>
                    <div className={theme.heading}>
                        {theme.headingText || 'Create Dataset'}
                    </div>
                    {theme.intro ?
                        <p className={theme.intro}>Pick what you’re bringing in. New sources start private to you — share them from the Admin tab.</p> : null}
                    <div className={theme.form}>
                        <div className={theme.field}>
                            <FieldLabel text={'Type'} />
                            {theme.typeCards ? (
                                <div className={theme.typeCards}>
                                    {selectOptions.map(({value}) => {
                                        const info = TYPE_INFO[value] || {...GENERIC_TYPE, label: value};
                                        const active = selectedType === value;
                                        return (
                                            <Button key={value || 'blank'}
                                                    activeStyle={active ? 'optionCardOn' : 'optionCard'}
                                                    aria-pressed={active}
                                                    onClick={() => handleSelectChange(value)}>
                                                <span className={active ? theme.typeCardIconActive : theme.typeCardIcon}>
                                                    <Icon icon={info.icon} className={theme.typeCardIconClass}/>
                                                </span>
                                                <span className={theme.typeCardText}>
                                                    <span className={theme.typeCardLabel}>{info.label}</span>
                                                    {value ? <span className={theme.typeCardKey}>{value}</span> : null}
                                                    <span className={theme.typeCardBlurb}>{info.blurb}</span>
                                                </span>
                                            </Button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <MultiSelect
                                    singleSelectOnly
                                    searchable={false}
                                    options={selectOptions}
                                    value={selectedType}
                                    onChange={handleSelectChange}
                                />
                            )}
                        </div>
                        <div className={theme.nameField}>
                            <FieldLabel htmlFor={'create-dataset-name'} text={'Name'} />
                            <Input
                                id={'create-dataset-name'}
                                value={data.name}
                                placeholder={'Dataset name'}
                                onChange={e => setData({...data, name: e.target.value})}
                            />
                        </div>

                        {!ExternalComp ? (
                            <div className={theme.actions}>
                                <Button
                                    activeStyle='primary'
                                    disabled={!data.name || submitting}
                                    onClick={handleCreate}
                                >{submitting ? 'Creating...' : 'Create'}</Button>
                                <Button
                                    activeStyle='action'
                                    onClick={() => navigate(baseUrl || '/')}
                                >Cancel</Button>
                            </div>
                        ) : (
                            <div className={theme.externalWrapper}>
                                <ExternalComp context={DatasetsContext} source={data}/>
                            </div>
                        )}
                    </div>
                </Body>
            </div>
        </Layout>
    )
}
