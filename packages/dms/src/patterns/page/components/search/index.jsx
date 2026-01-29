import React, {Fragment, useEffect, useContext, useState} from "react";
import {Dialog, DialogPanel, Input, Transition} from '@headlessui/react'
import {dmsDataLoader} from "../../../../api";
import { ThemeContext, getComponentTheme } from "../../../../ui/useTheme";
import {CMSContext} from "../../context";
import {boldMatchingText, getScore, searchTypeMapping} from "./SearchPage";
import { searchButtonTheme, searchPalletTheme } from "./theme";

export default function SearchButton ({app, type, activeStyle}) {
    const [open, setOpen] = useState(false)
    const { theme: fullTheme = { pages: { searchButton: searchButtonTheme } }, UI } = useContext(ThemeContext);
    const theme = getComponentTheme(fullTheme, 'pages.searchButton', activeStyle);
    const { Icon } = UI;

    return (
        <>
            <button
                className={theme?.button}
                onClick={() => setOpen(true)}
            >
                <span className={theme?.buttonText}>Search</span>

                <div className={theme?.iconWrapper}>
                    <Icon
                        icon={theme?.icon}
                        height={theme?.iconSize}
                        width={theme?.iconSize}
                        className={theme?.iconClass}
                    />
                </div>
            </button>
            <SearchPallet open={open} setOpen={setOpen} app={app} type={type}/>
        </>
    )
}

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

const RenderSuggestions = ({individualTags, query, setQuery, theme}) => individualTags
    .filter(tag => (!query?.length || tag.toLowerCase().includes(query.toLowerCase())))
    .length > 0 ? (
    <div className={theme?.suggestionsWrapper}>
        <span className={theme?.suggestionsLabel}>suggestions: </span>
        {individualTags
            .filter(tag => (!query?.length || tag.toLowerCase().includes(query.toLowerCase())))
            .filter((tag, i) => i <= 5)
            .map((tag) => (
                <div
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className={theme?.suggestionItem}
                >
                    <div>
                        <i className={theme?.suggestionTagIcon}/>
                        <span className={theme?.suggestionTagText}> {tag} </span>
                    </div>
                </div>
            ))}
    </div>
) : null;

const RenderItems = ({items, query, theme, Icon}) => Object.keys(items).length ? (
    <div className={theme?.resultsWrapper}>
        {Object.keys(items)
            .sort((a, b) => items[b].score - items[a].score)
            .map((page_id) => (
                <div
                    key={page_id}
                    className={theme?.resultItemOuter}
                >
                    <div
                        key={page_id}
                        className={theme?.resultItemWrapper}
                    >
                        {/*page title*/}
                        <div
                            className={theme?.pageResultWrapper}
                            onClick={e => {
                                window.location = `${items[page_id].url}`
                            }}>
                            <Icon
                                icon={theme?.pageIcon}
                                width={theme?.pageIconWidth}
                                height={theme?.pageIconHeight}
                            />
                            <div className={theme?.pageTitle}>{boldMatchingText(items[page_id].page_title || page_id, query)}</div>
                            <Icon icon={theme?.pageArrowIcon} className={theme?.pageArrowClass}/>
                        </div>

                        <div className={theme?.sectionsWrapper}>
                            {/*sections*/}
                            {(items[page_id].sections || [])
                                .filter(({section_title, tags}) => {
                                    // only include search results that matches
                                    return (tags && tags.toLowerCase().includes(query.toLowerCase())) ||
                                        (section_title && section_title.toLowerCase().includes(query.toLowerCase()))
                                })
                                .map(({
                                          section_id,
                                          section_title,
                                          tags = '',
                                          score
                                      }) => (
                                <div
                                    key={section_id}
                                    className={theme?.sectionItemWrapper}
                                    onClick={() => window.location = `${items[page_id].url}#${section_id}`}
                                >
                                    {/*section title*/}
                                    <div className={theme?.sectionTitleWrapper}>
                                        <Icon
                                            icon={theme?.sectionIcon}
                                            width={theme?.sectionIconWidth}
                                            height={theme?.sectionIconHeight}
                                        />
                                        <div className={theme?.sectionTitle}>{boldMatchingText(section_title || section_id, query)}</div>
                                        <Icon icon={theme?.pageArrowIcon} className={theme?.sectionArrowClass}/>
                                    </div>
                                    {/*tags*/}
                                    <div className={theme?.tagsWrapper}>
                                        {
                                            tags?.split(',').filter(t => t && t.length).map(tag => (
                                                <span
                                                    key={tag}
                                                    className={`${theme?.tag} ${tag.toLowerCase() === query.toLowerCase() ? theme?.tagMatch : theme?.tagNoMatch}`}
                                                >
                                                    {boldMatchingText(tag, query)}
                                                </span>
                                            ))
                                        }
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
    </div>
) : null;

const RenderStatus = ({loading, query, itemsLen, theme}) =>
    loading ? (
            <div className={theme?.loadingWrapper}>
                <i className={theme?.loadingIcon}/>
                <p className={theme?.loadingText}>Loading...</p>
            </div>
        ) :
        query && query !== '' && itemsLen === 0 && (
            <div className={theme?.noResultsWrapper}>
                <i className={theme?.noResultsIcon}/>
                <p className={theme?.noResultsTitle}>No results found</p>
                <p className={theme?.noResultsText}>No components found for this search term. Please try again.</p>
            </div>
        );

export const SearchPallet = ({open, setOpen, app: appFromProps, type: typeFromProps, searchStr, activeStyle}) => {
    const {baseUrl, falcor, app=appFromProps, type=typeFromProps} = useContext(CMSContext) || {};
    const { theme: fullTheme = { pages: { searchPallet: searchPalletTheme } }, UI } = useContext(ThemeContext);
    const theme = getComponentTheme(fullTheme, 'pages.searchPallet', activeStyle);
    const {Icon} = UI;
    const [query, setQuery] = useState();
    const [tmpQuery, setTmpQuery] = useState(searchStr);
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState([]);
    const [individualTags, setIndividualTags] = useState([]);
    const [data, setData] = useState({});
    const [items, setItems] = useState({});
    const searchType = 'tags'; // the query has been updated to search by page title, section title, and tags.

    useEffect(() => {
        setTmpQuery(searchStr)
    }, [searchStr])

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
            setTags((tags?.value || [] ).map(t => t[searchType]).sort());
            setIndividualTags([...new Set((tags?.value || []).reduce((acc, t) => [...acc, ...t[searchType].split(',')], []))].sort());
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
            console.log('data', data)
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
                    <div className={theme?.backdrop}/>
                </Transition.Child>

                <div className={theme?.dialogContainer}>
                    <Transition.Child
                        as={Fragment}
                        enter="ease-out duration-300"
                        enterFrom="opacity-0 scale-95"
                        enterTo="opacity-100 scale-100"
                        leave="ease-in duration-200"
                        leaveFrom="opacity-100 scale-100"
                        leaveTo="opacity-0 scale-95"
                    >
                        <DialogPanel className={theme?.dialogPanel}>
                            <div className={theme?.inputWrapper}>
                                <Input
                                    autoFocus
                                    className={theme?.input}
                                    placeholder="Search..."
                                    value={tmpQuery}
                                    onChange={(event) =>{
                                        setTmpQuery(event.target.value)
                                    }}
                                />
                                <div className={theme?.searchIconWrapper}>
                                    <Icon icon={theme?.searchIcon} className={theme?.searchIconClass} />
                                </div>
                            </div>

                            {/*<RenderSuggestions tags={tags} individualTags={individualTags} query={tmpQuery} setQuery={setTmpQuery} theme={theme} />*/}

                            <RenderItems key={'search-items'} items={items} query={query} theme={theme} Icon={Icon}/>

                            <RenderStatus key={'search-suggestions'} query={query} loading={loading} itemsLen={Object.keys(items).length} theme={theme}/>
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
