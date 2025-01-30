import React, {Fragment, useContext, useEffect, useState} from "react";
import {useParams, useNavigate, useSearchParams} from "react-router-dom";
import {dmsDataLoader} from "../../../../api";
import {getConfig} from "./index";
import { Layout } from "../../ui";
import {CMSContext} from "../../siteConfig";
import {dataItemsNav, detectNavLevel} from "../../pages/_utils";
import dataTypes from "../../../../data-types";
import {ArrowRight, Page, Section} from '../../../admin/ui/icons';

export const searchTypeMapping = {
    tags: 'byTag',
    page_title: 'byPageTitle'
}

const getSearchURL = ({value, baseUrl, type='tags'}) => !baseUrl || baseUrl === '' ? `/search/?q=${value}&type=${type}` : `${baseUrl}/search/?q=${value}&type=${type}`;

export const getScore = (valuesToMatch, query) => {
    const regex = new RegExp(`(${query})`, 'gi');

    return valuesToMatch.filter(v => v).reduce((acc, value) => value.toLowerCase() === query.toLowerCase() ? acc + 1 : regex.test(value) ? acc + 0.5 : acc, 0);
}
export const boldMatchingText = (text, query) => {
    if (!query) return text; // If there's no query, just return the original text.

    const parts = text.split(new RegExp(`(${query})`, 'gi')); // 'gi' for case-insensitive search
    return (
        <>
            {parts.map((part, index) =>
                part.toLowerCase() === query.toLowerCase() ?
                    <React.Fragment key={index}>
                        <div className="inline-block font-bold">
                            {index > 0 && parts[index - 1]?.endsWith(' ') ? ' ' : ''}
                            {part}
                            {index < parts.length - 1 && part[index + 1]?.startsWith(' ') ? ' ' : ''}
                        </div>
                    </React.Fragment> :
                    part
            )}
        </>
    );
};

export const RenderTagSuggestions = ({individualTags, query, setQuery, navigate, baseUrl}) =>
    individualTags
    .filter(tag => (!query?.length || tag.toLowerCase().includes(query.toLowerCase())))
    .length > 0 && (
    <div className="max-h-96 scroll-py-3 overflow-y-auto p-3 flex items-center">
        <span className={'text-xs italic'}>suggestions: </span>
        <div className={'flex'}>
            {individualTags
                .filter(tag => (!query?.length || tag.toLowerCase().includes(query.toLowerCase())))
                .filter((tag, i) => i <= 5)
                .map((tag) => (
                    <div
                        key={tag}
                        onClick={() => {
                            setQuery && setQuery(tag)
                            navigate && navigate(getSearchURL({value: tag, baseUrl}))
                        }}
                        className={`mx-0.5 cursor-pointer rounded-xl py-0.5 px-1.5 bg-gray-500 text-white text-xs`}
                    >
                        {tag}
                    </div>
                ))}
        </div>
    </div>
);

export const RenderItems = ({items, query, setQuery}) => {
    return (
        <div className="max-h-[calc(100vh-150px)] scroll-py-3 overflow-y-auto overflow-x-hidden p-3 bg-slate-100 scrollbar-sm">
            {Object.keys(items)
                .sort((a,b) => items[b].score - items[a].score)
                .map((page_id) => (
                <div
                    key={page_id}
                    className={`select-none rounded-xl p-3 bg-slate-10 hover:bg-slate-200 transition ease-in`}
                >
                    {/*page title*/}
                    <div className={`group w-full flex items-center text-xl font-medium w-fit text-gray-700 hover:text-gray-700 cursor-pointer`}
                         onClick={e => {
                             if(!setQuery){
                                 window.location = `${items[page_id].url}` // using this in modal would mean no action on click
                             }
                         }}>
                        <Page className="flex items-center h-6 w-6 mr-2 border rounded-md"/>
                        <div>{boldMatchingText(items[page_id].page_title || page_id, query)}</div>
                        <ArrowRight className={'h-6 w-6 ml-2 text-transparent group-hover:text-gray-900'}/>
                    </div>

                    <div className="ml-3 pl-4 flex-auto border-l border-gray-900">
                        {/*sections*/}
                        <div>
                            {(items[page_id].sections || []).map(({section_id, section_title, tags = '', score}) => (
                                <div className={'w-full cursor-pointer group'} onClick={() => {
                                    if(!setQuery){
                                        window.location = `${items[page_id].url}#${section_id}` // using this in modal would mean no action on click
                                    }
                                }}>
                                    {/*section title*/}
                                    <div
                                        className={'w-full flex items-center text-md font-medium text-gray-700 hover:text-gray-700'}>
                                        <Section className="h-6 w-6 mr-2 border rounded-md"/>
                                        <div>{boldMatchingText(section_title || section_id, query)}</div>
                                        <ArrowRight className={'h-6 w-6 ml-2 text-transparent group-hover:text-gray-900'}/>

                                    </div>
                                    {/*tags*/}
                                    <div className={'w-full ml-8'}>
                                        {
                                            tags?.split(',').filter(t => t && t.length).map(tag => (
                                                <span className={`tracking-wide p-1 text-xs text-white font-semibold rounded-md border 
                                                ${tag.toLowerCase() === query.toLowerCase() ? 'border-1 border-red-600 bg-red-400' : 'bg-red-300'}`}>
                                                    {boldMatchingText(tag, query)}
                                                </span>))
                                        }
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )
}

export const RenderStatus = ({loading, query, itemsLen}) =>
    loading ? (
            <div className="p-2 mx-auto w-1/4 h-full flex items-center justify-middle">
                <i className="px-2 fa fa-loader text-gray-400"/>
                <p className="font-semibold text-gray-900">Loading...</p>
            </div>
        ) :
        query && query !== '' && itemsLen === 0 && (
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
    const [searchParams] = useSearchParams();
    const {baseUrl, theme, user, falcor, falcorCache, ...rest} = useContext(CMSContext) || {}
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState([]);
    const [individualTags, setIndividualTags] = useState([]);
    const [data, setData] = useState({});
    const [items, setItems] = useState();
    const [searchType, setSearchType] = useState(searchParams.get('type') || 'tags');
    const query = searchParams.get('q');

    const app = format?.app;
    const type = format?.type;

    const Radio = dataTypes.radio.EditComp;

    const menuItems = React.useMemo(() => {
        let items = dataItemsNav(dataItems,baseUrl,false)
        return items
    }, [dataItems])


    useEffect(() => {
        async function getTags() {
            setLoading(true)
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
            setLoading(false)
        });
    }, [searchType]);

    useEffect(() => {
        if (!query) return;
        // search for sections matching query.

        const handler = setTimeout(() => {
            setLoading(true);
            async function getData() {
                const config = getConfig({
                    app,
                    type,
                    action: 'search',
                    tags: Array.isArray(query) ? query : [query],
                    searchType: searchTypeMapping[searchType]
                })
                return await dmsDataLoader(falcor, config, '/');

            }

            getData().then(data => {
                setData(data)
                setLoading(false);
            });
        }, 500); // 500ms delay

        // Cleanup timeout if `tmpQuery` changes before the delay is over
        return () => {
            clearTimeout(handler);
        };
        // search for page title and url for matched sections
    }, [query]);

    useEffect(() => {
        // page with most hits in title and sections comes up
        // section with most match comes up
        // {page_id, page_title, url, sections: [{section_id, section_title, tags}]}
        const pagesForQuery = data[query]?.value?.reduce((acc, {page_id, page_title, url_slug, section_id, section_title, tags, ...rest}) => {
            const score = getScore([...(section_title?.split(' ') || []), ...(tags?.split(',') || [])], query);
            acc[page_id] = {
                page_title,
                url: `${baseUrl}/${url_slug}`,
                sections: [...(acc[page_id]?.sections || []), {section_id, section_title, tags, score}].sort((a,b) => b.score - a.score),
                score: getScore([page_title], query) + score + (acc[page_id]?.sections || []).reduce((acc, curr) => acc + (curr.score || 0), 0)
            }
            return acc;
        }, {})

        setItems(pagesForQuery || {})
    }, [data, query])
    console.log('query', baseUrl, query, loading, items)
    return (
        <Layout navItems={menuItems}>
            <div className={`${theme?.page?.wrapper1} ${theme?.navPadding[0]}`}>
                <div className={'w-full text-xl border-2 p-2 rounded-md'}>
                    <input
                        className={'w-full'}
                        placeholder={'Search...'}
                        value={query}
                        onChange={e => {
                            navigate(getSearchURL({value: e.target.value, baseUrl, type: searchType}))
                        }}
                        onKeyDown={() => setLoading(true)}
                        // onKeyUp={() => setLoading(false)}
                    />

                    <RenderTagSuggestions individualTags={individualTags} query={query}
                                          navigate={navigate} baseUrl={baseUrl}
                    />
                </div>

                {
                    items && Object.keys(items).length ? <RenderItems items={items} query={query}/> :
                        <RenderStatus query={query} loading={loading} itemsLen={items && Object.keys(items).length} />
                }
            </div>
        </Layout>)
}