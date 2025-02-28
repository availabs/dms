import React, {Fragment, useEffect, useContext, useState} from "react";
import {Dialog, DialogPanel, Input, Transition} from '@headlessui/react'
import {dmsDataLoader} from "../../../../api";
import {CMSContext} from "../../siteConfig";
import {Link} from "react-router-dom";
import {boldMatchingText, getScore, searchTypeMapping} from "./SearchPage";
import {ArrowRight, Page, Section} from "../../../admin/ui/icons";
import {Search} from "../../ui/icons";

export const SearchButton = ({app, type}) => {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                className={`
                bg-white flex justify-between items-center 
                h-[48px] w-[217px] py-[8px] pr-[8px] pl-[24px] 
                border border-[#E0EBF0] rounded-[1000px]
                shadow-sm transition ease-in
                `}
                onClick={() => setOpen(true)}
            >
                <span className={'uppercase text-[#2D3E4C] font-medium text-[12px] leading-[14.62px] tracking-none'}>Search</span>

                <div className={'bg-[#37576B] p-[10px] rounded-full'}>
                    <Search height={12} width={12} className={'text-white'}/>
                </div>
            </button>
            <SearchPallet open={open} setOpen={setOpen} app={app} type={type}/>
        </>
    )
}

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

const RenderSuggestions = ({individualTags, query, setQuery}) => individualTags
    .filter(tag => (!query?.length || tag.toLowerCase().includes(query.toLowerCase())))
    .length > 0 ? (
    <div className="flex items-center max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3">
        <span className={'text-xs italic'}>suggestions: </span>
        {individualTags
            .filter(tag => (!query?.length || tag.toLowerCase().includes(query.toLowerCase())))
            .filter((tag, i) => i <= 5)
            .map((tag) => (
                <div
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className={'flex cursor-pointer select-none hover:bg-gray-100  rounded-xl p-1'}
                >
                    <div>
                        <i className="text-xs text-red-400 fa fa-tag"/>
                        <span
                            className={classNames(
                                'ml-2 text-sm font-medium',
                                focus ? 'text-gray-900' : 'text-gray-700'
                            )}
                        > {tag} </span>
                    </div>
                </div>
            ))}
    </div>
) : null;

const RenderItems = ({items, query}) => Object.keys(items).length ? (
    <div
        className="p-3 max-h-[500px] transform-gpu scroll-py-3 overflow-x-hidden overflow-y-auto scrollbar-sm">
        {Object.keys(items)
            .sort((a, b) => items[b].score - items[a].score)
            .map((page_id) => (
                <div
                    key={page_id}
                    className={'select-none rounded-xl m-1'}
                >
                    <div
                        key={page_id}
                        className={`w-full select-none rounded-xl p-2 bg-slate-100 hover:bg-slate-200 transition ease-in`}
                    >
                        {/*page title*/}
                        <div
                            className={`group w-full flex items-center text-xl font-medium text-gray-700 hover:text-gray-700 cursor-pointer`}
                            onClick={e => {
                                window.location = `${items[page_id].url}`
                            }}>
                            <Page className="flex items-center h-6 w-6 mr-2 border rounded-md"/>
                            <div>{boldMatchingText(items[page_id].page_title || page_id, query)}</div>
                            <ArrowRight className={'h-6 w-6 ml-2 text-transparent group-hover:text-gray-900'}/>
                        </div>

                        <div className="ml-3 pl-4 flex-auto border-l border-gray-900">
                            {/*sections*/}
                            <div>
                                {(items[page_id].sections || []).map(({
                                                                          section_id,
                                                                          section_title,
                                                                          tags = '',
                                                                          score
                                                                      }) => (
                                    <div className={'w-full cursor-pointer group'}
                                         onClick={() => window.location = `${items[page_id].url}#${section_id}`}>
                                        {/*section title*/}
                                        <div
                                            className={'w-full flex items-center text-md font-medium text-gray-700 hover:text-gray-700'}>
                                            <Section className="h-6 w-6 mr-2 border rounded-md"/>
                                            <div>{boldMatchingText(section_title || section_id, query)}</div>
                                            <ArrowRight
                                                className={'h-6 w-6 ml-2 text-transparent group-hover:text-gray-900'}/>

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
                </div>
            ))}
    </div>
) : null;

const RenderStatus = ({loading, query, itemsLen}) =>
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

const SearchPallet = ({open, setOpen, app, type}) => {
    const {baseUrl, falcor, falcorCache} = useContext(CMSContext) || {}
    const [query, setQuery] = useState();
    const [tmpQuery, setTmpQuery] = useState();
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState([]);
    const [individualTags, setIndividualTags] = useState([]);
    const [data, setData] = useState({});
    const [items, setItems] = useState({});
    const searchType = 'tags'; // the query has been updated to search by page title, section title, and tags.

    useEffect(() => {
        // Debounce logic: only update `query` after a delay when `tmpQuery` changes
        const handler = setTimeout(() => {
            setQuery(tmpQuery);
        }, 500); // 500ms delay

        // Cleanup timeout if `tmpQuery` changes before the delay is over
        return () => {
            clearTimeout(handler);
        };
    }, [tmpQuery]);

    useEffect(() => {
        async function getTags() {
            setLoading(true)
            const config = getConfig({
                app,
                type,
                action: 'searchTags'
            });

            return dmsDataLoader(falcor, config, '/');
        }

        getTags().then(tags => {
            setTags(tags.value.map(t => t[searchType]).sort());
            setIndividualTags([...new Set(tags.value.reduce((acc, t) => [...acc, ...t[searchType].split(',')], []))].sort());
            setLoading(false)
        });
    }, []);

    useEffect(() => {
        if (!query) return;
        setLoading(true)
        // search for sections matching query.
        const config = getConfig({
            app,
            type,
            action: 'search',
            tags: Array.isArray(query) ? query : [query],
            searchType: searchTypeMapping[searchType]
        })

        async function getData() {
            const data = await dmsDataLoader(falcor, config, '/');
            return data;
        }

        getData().then(data => {
            setData(data);
            setLoading(false);
        });
    }, [query]);

    useEffect(() => {
        // page with most hits in title and sections comes up
        // section with most match comes up
        // {page_id, page_title, url, sections: [{section_id, section_title, tags}]}
        function processData() {

            if (!data[query]?.value?.length) {
                return {};
            }
            const pagesForQuery = data[query]?.value?.reduce((acc, {page_id, page_title, url_slug, section_id, section_title, tags, ...rest}) => {
                const score = getScore([...(section_title?.split(' ') || []), ...(tags?.split(',') || [])], query);
                acc[page_id] = {
                    page_title,
                    url: `${baseUrl}/${url_slug}`,
                    sections: [...(acc[page_id]?.sections || []), {
                        section_id,
                        section_title,
                        tags,
                        score
                    }].sort((a, b) => b.score - a.score),
                    score: getScore([page_title], query) + score + (acc[page_id]?.sections || []).reduce((acc, curr) => acc + (curr.score || 0), 0)
                }
                return acc;
            }, {});

            return pagesForQuery;
        }

        const items = processData();
        setItems(items);
    }, [data, query])

    return (
        <Transition.Root show={open} as={Fragment} afterLeave={() => setQuery('')} appear>
            <Dialog key={'search-dialogue'} as="div" className="relative z-20" onClose={setOpen}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-25 transition-opacity"/>
                </Transition.Child>

                <div className="fixed inset-0 z-20 w-screen overflow-y-auto p-4 sm:p-6 md:p-20">
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0 scale-95"
                        enterTo="opacity-100 scale-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100 scale-100"
                        leaveTo="opacity-0 scale-95"
                    >
                        <DialogPanel
                            className="mx-auto max-w-3xl max-h-3/4 transform divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black ring-opacity-5 transition-all">
                            {/*<Combobox onChange={(item) => {
                                if (items?.[item]?.url){
                                    window.location = items[item].id ? `${items[item].url}#${items[item].id}` : `${items[item].url}`
                                }
                            }}
                            >*/}
                                <div className="flex items-center relative px-2">
                                    <i
                                        className="fa-light fa-search pointer-events-none h-5 w-5 text-gray-400"
                                    />
                                    <Input
                                        autoFocus
                                        className="h-10 w-full border-0 bg-transparent p-2 mx-1 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm rounded-md ring-0 outline-none"
                                        placeholder="Search..."
                                        value={tmpQuery}
                                        onChange={(event) =>{
                                            // const match = tags.find(tag => tag.toLowerCase() === event.target.value.toLowerCase());
                                            setTmpQuery(event.target.value)
                                        }}
                                    />

                                    <Link
                                        className={'fa-light fa-arrow-up-right-from-square h-5 w-5 text-gray-400'}
                                        title={'Open Search Page'}
                                     to={'search'}/>
                                </div>

                                <RenderSuggestions tags={tags} individualTags={individualTags} query={tmpQuery} setQuery={setTmpQuery} />

                                <RenderItems key={'search-items'} items={items} query={query}/>

                                <RenderStatus key={'search-suggestions'} query={query} loading={loading} itemsLen={Object.keys(items).length} />
                            {/*</Combobox>*/}
                        </DialogPanel>
                    </Transition.Child>
                </div>
            </Dialog>
        </Transition.Root>
    )
}


export const getConfig = ({
      app,
      type,
      filter,
      action = 'load',
      tags, searchType,
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
                searchType,
                attributes: attributes.map(a => a.key)
            },
            path: '/'
        }
    ]
})