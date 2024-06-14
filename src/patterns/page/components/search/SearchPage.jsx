import React, {Fragment, useContext, useEffect, useState} from "react";
import {useParams, useNavigate, useSearchParams} from "react-router-dom";
import {dmsDataLoader} from "../../../../api";
import {getConfig} from "./index";
import Layout from "../../ui/avail-layout";
import {CMSContext} from "../../siteConfig";
import {Combobox} from "@headlessui/react";

const searchItemWrapperClass = `p-2 bg-blue-50 hover:bg-blue-100`

const RenderTagSuggestions = ({tags, tmpQuery, setQuery, navigate, baseUrl}) => tags
    .filter(tag => (!tmpQuery?.length || tag.toLowerCase().includes(tmpQuery.toLowerCase())))
    .length > 0 && (
    <div className="max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3 flex items-center">
        <span className={'text-xs italic'}>suggestions: </span>
        <div className={'flex'}>
            {tags
                .filter(tag => (!tmpQuery?.length || tag.toLowerCase().includes(tmpQuery.toLowerCase())))
                .filter((tag, i) => i <= 5)
                .map((tag) => (
                    <div
                        key={tag}
                        onClick={() => {
                            setQuery(tag)
                            navigate(`/${baseUrl}/search/?q=${tag}&type=tag`)
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
    <div className="max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3">
        {items.map((item) => (
            <div
                key={item.id}
                className={`flex cursor-pointer select-none rounded-xl p-3 bg-gray-100`}
                onClick={e => {
                    navigate(`/${item.url}#${item.id}`)
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
                    <span
                        className={'tracking-wide p-1 bg-red-400 text-xs text-white font-semibold rounded-md border'}>{item.tags}</span>
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
    const {baseUrl, falcor, falcorCache, ...rest} = useContext(CMSContext) || {}
    const [query, setQuery] = useState(searchParams.get('q'));
    const [tmpQuery, setTmpQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState([]);
    const [items, setItems] = useState([]);

    const app = format?.app;
    const type = format?.type;
    console.log('app',)

    useEffect(() => {
        async function getTags() {
            const config = getConfig({
                app,
                type,
                action: 'searchTags'
            });

            return dmsDataLoader(falcor, config, '/');
        }

        getTags().then(tags => setTags(tags.value.map(t => t.tags).sort()));
    }, []);

    useEffect(() => {
        if (!query) return;
        // search for sections matching query.

        const config = getConfig({
            app,
            type,
            action: 'search',
            tags: [query]
        })

        async function getData() {
            setLoading(true)
            const data = await dmsDataLoader(falcor, config, '/');
            // console.log('cs', Object.keys(data).find(searchTerm => searchTerm === query),
            //     query, data
            // )
            const tmpItems = data[query]?.value?.map(value => {
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
            })

            // console.log('setting items', query, tmpItems)
            setItems(tmpItems || [])
            setLoading(false)
        }

        getData();
        // search for page title and url for matched sections
    }, [query]);

    return (
        <Layout navItems={[]}>
            <div className={'w-full text-xl border-2 p-2 rounded-md'}>
                <input
                    className={'w-full'}
                    placeholder={'Search...'}
                    value={query}
                    onChange={e => {
                        setQuery(e.target.value)
                        navigate(`/${baseUrl}/search/?q=${e.target.value}&type=tag`)
                    }}/>
            </div>
            
            <RenderTagSuggestions tags={tags} tmpQuery={tmpQuery} setQuery={setQuery} navigate={navigate} baseUrl={baseUrl}/>

            <RenderItems items={items} navigate={navigate}/>

            <RenderStatus query={query} loading={loading} itemsLen={items.length} />
        </Layout>)
}