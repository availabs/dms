import React, {Fragment, useContext, useEffect, useState} from "react";
import {useParams, useNavigate, useSearchParams} from "react-router-dom";
import {dmsDataLoader} from "../../../../api";
import {getConfig} from "./index";
import Layout from "../../ui/avail-layout";
import {CMSContext} from "../../siteConfig";
import {Combobox} from "@headlessui/react";
import {dataItemsNav, detectNavLevel} from "../../pages/_utils";
import dataTypes from "../../../../data-types";

const searchTypeMapping = {
    tags: 'byTag',
    page_title: 'byPageTitle'
}

const getSearchURL = ({value, baseUrl, type='tags'}) => !baseUrl || baseUrl === '' ? `/search/?q=${value}&type=${type}` : `/${baseUrl}/search/?q=${value}&type=${type}`;

const RenderTagSuggestions = ({tags, individualTags, tmpQuery, setQuery, navigate, baseUrl}) =>
    individualTags
    .filter(tag => (!tmpQuery?.length || tag.toLowerCase().includes(tmpQuery.toLowerCase())))
    .length > 0 && (
    <div className="max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3 flex items-center">
        <span className={'text-xs italic'}>suggestions: </span>
        <div className={'flex'}>
            {individualTags
                .filter(tag => (!tmpQuery?.length || tag.toLowerCase().includes(tmpQuery.toLowerCase())))
                .filter((tag, i) => i <= 5)
                .map((tag) => (
                    <div
                        key={tag}
                        onClick={() => {
                            setQuery(tags.filter(t => t.split(',').includes(tag)))
                            navigate(getSearchURL({value: tag, baseUrl}))
                        }}
                        className={`mx-0.5 cursor-pointer rounded-xl py-0.5 px-1.5 bg-gray-500 text-white text-xs`}
                    >
                        {tag}
                    </div>
                ))}
        </div>
    </div>
);

const RenderItems = ({items, navigate}) => items.length > 0 && (
    <div className="h-full transform-gpu scroll-py-3 overflow-y-auto p-3">
        {items.map((item) => (
            <div
                key={item.id}
                className={`flex cursor-pointer select-none rounded-xl p-3 bg-slate-100 hover:bg-slate-200 transition ease-in`}
                onClick={e => {
                    // navigate(`/${item.url}#${item.id}`)
                    window.location = item.id ? `${item.url}#${item.id}` : `${item.url}`;
                }}
            >
                <div
                    className={`flex h-10 w-10 flex-none items-center justify-center rounded-lg ${item.color}`}
                >
                    <item.icon className="h-6 w-6 text-white"
                               aria-hidden="true"/>
                </div>
                <div className="ml-4 flex-auto">
                    <p
                        className={`text-sm font-medium w-fit
                            text-gray-700 hover: text-gray-700
                            ${item.titleMatch ? 'bg-yellow-300 px-1 rounded-md' : ''}`}
                    >
                        {item.name || item.id}
                    </p>
                    <p className={`text-sm text-gray-500 hover:text-gray-700`}>
                        {item.description}
                    </p>
                    {
                        (item.tags || '').split(',').filter(t => t).map(tag => <span
                            className={'tracking-wide p-1 bg-red-400 text-xs text-white font-semibold rounded-md border'}>{tag}</span>)
                    }
                </div>
            </div>
        ))}
    </div>
)

const RenderStatus = ({loading, query, itemsLen}) =>
    loading ? (
            <div className="p-2 mx-auto w-1/4 h-full flex items-center justify-middle">
                <i className="px-2 fa fa-loader text-gray-400"/>
                <p className="font-semibold text-gray-900">Loading...</p>
            </div>
        ) :
        query !== '' && itemsLen === 0 && (
            <div className="px-6 py-14 text-center text-sm sm:px-14">
                <i
                    className="fa fa-exclamation mx-auto h-6 w-6 text-gray-400"
                />
                <p className="mt-4 font-semibold text-gray-900">No results found</p>
                <p className="mt-2 text-gray-500">No components found for this search term.
                    Please try again.</p>
            </div>
        );

export const SearchPage = ({item, dataItems, format, attributes, logo, rightMenu}) => {
    const navigate = useNavigate();
    const params = useParams();
    const [searchParams] = useSearchParams();
    const {baseUrl, theme, user, falcor, falcorCache, ...rest} = useContext(CMSContext) || {}
    const [query, setQuery] = useState();
    const [tmpQuery, setTmpQuery] = useState(searchParams.get('q'));
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState([]);
    const [individualTags, setIndividualTags] = useState([]);
    const [items, setItems] = useState([]);
    const [searchType, setSearchType] = useState(searchParams.get('type') || 'tags');

    const app = format?.app;
    const type = format?.type;

    const Radio = dataTypes.radio.EditComp;
    useEffect(() => {
        setTmpQuery(searchParams.get('q'))
    }, [searchParams.get('q')])

    const menuItems = React.useMemo(() => {
        let items = dataItemsNav(dataItems,baseUrl,false)
        return items
    }, [dataItems])

    useEffect(() => {
        const matchingTags = tags.filter(t => t.split(',').includes(tmpQuery))
        const q = searchType === 'tags' && matchingTags.length ? matchingTags :
                            searchType === 'tags' && !matchingTags.length ? tmpQuery : tmpQuery;
        setTimeout(() => setQuery(q), 0)
    }, [tags, tmpQuery]);

    useEffect(() => {
        async function getTags() {
            const config = getConfig({
                app,
                type,
                action: searchType === 'tags' ? 'searchTags' : 'searchPageTitles'
            });

            return dmsDataLoader(falcor, config, '/');
        }
        getTags().then(tags => {
            setTags(tags.value.map(t => t[searchType]).sort());
            setIndividualTags([...new Set(tags.value.reduce((acc, t) => [...acc, ...t[searchType].split(',')], []))].sort());
        });
    }, [searchType]);

    useEffect(() => {
        if (!query) return;
        // search for sections matching query.
        const config = getConfig({
            app,
            type,
            action: 'search',
            tags: Array.isArray(query) ? query : [query],
            searchType: searchTypeMapping[searchType]
        })

        async function getData() {
            setLoading(true)
            const data = await dmsDataLoader(falcor, config, '/');

            const tmpItems = (Array.isArray(query) ? query : [query]).reduce((acc, q) => {
                const pagesForQuery = data[q]?.value?.map(value => {
                    return ({
                        id: value.section_id,
                        name: value.section_title,
                        tags: value.tags,
                        description: value.page_title,
                        url: `${baseUrl}/${value.url_slug}`,
                        type: value.type,
                        color: 'bg-indigo-500',
                        titleMatch: value.section_title?.includes(query) && !value.tags?.includes(query),
                        icon: () => <i className={'fa-light fa-memo text-white'}/>,
                    })
                });
                return [...acc, ...(pagesForQuery || [])]
            }, []);

            setItems(tmpItems || [])
            setLoading(false)
        }

        getData();
        // search for page title and url for matched sections
    }, [query]);

    return (
        <Layout navItems={menuItems}>
            <div className={`${theme?.page?.wrapper1} ${theme?.navPadding[0]}`}>
                <div className={'p-2 text-sm text-gray-800 flex items-center'}>
                    search by:
                    <Radio options={[{label: 'Tags', value: 'tags'}, {label: 'Page Title', value: 'page_title'}]}
                           onChange={v => {
                               setSearchType(v);
                               navigate(getSearchURL({value: query, baseUrl, type: v}))
                           }}
                           value={searchType}
                           inline={true}/>
                </div>
                <div className={'w-full text-xl border-2 p-2 rounded-md'}>
                    <input
                        className={'w-full'}
                        placeholder={'Search...'}
                        value={tmpQuery}
                        onChange={e => {
                            const matchingTags = tags.filter(t => t.split(',').map(t => t.toLowerCase()).includes(e.target.value?.toLowerCase()));

                            const q = searchType === 'tags' && matchingTags.length ? matchingTags :
                                                    searchType === 'tags' && !matchingTags.length ? e.target.value :
                                                        e.target.value;
                            setQuery(q)
                            setTmpQuery(e.target.value)
                            navigate(getSearchURL({value: e.target.value, baseUrl, type: searchType}))
                        }}/>
                </div>

                <RenderTagSuggestions tags={tags} individualTags={individualTags} tmpQuery={tmpQuery} setQuery={setQuery} navigate={navigate} baseUrl={baseUrl}/>

                {
                    items.length ? <RenderItems items={items} navigate={navigate}/> :
                        <RenderStatus query={query} loading={loading} itemsLen={items.length} />
                }
            </div>
        </Layout>)
}