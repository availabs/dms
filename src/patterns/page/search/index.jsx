import {Fragment, useEffect, useContext, useState} from "react";
import {Combobox, Dialog, Transition} from '@headlessui/react'
import {getConfig} from "../layout/template/pages";
import {dmsDataLoader} from "../../../api";
import {CMSContext} from "../siteConfig";

export const Search = ({app, type}) => {
    const [open, setOpen] = useState(false)

    return (
        <div className='w-full h-full p-2'>
            <button
                className={"bg-white h-full w-full flex items-center text-sm leading-6 text-slate-400 hover:text-slate-600 rounded-lg shadow-sm py-1.5 pl-4 pr-8 transition ease-in"}
                onClick={() => setOpen(true)}
            >
                <i className={'fa-light fa-search pr-2 '}/> Search
            </button>

            <SearchPallet open={open} setOpen={setOpen} app={app} type={type}/>
        </div>
    )
}

function classNames(...classes) {
    return classes.filter(Boolean).join(' ')
}

const SearchPallet = ({open, setOpen, app, type}) => {
    const { baseUrl, falcor, falcorCache } = useContext(CMSContext)
    const [query, setQuery] = useState('');
    const [tmpQuery, setTmpQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState([]);
    const [items, setItems] = useState([]);
    // change it so that query is only set when whole tag is searched from typeahead

    useEffect(() => {
        setTimeout(() => setQuery(tmpQuery), 0)
    }, [tmpQuery]);

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
                    icon: () => <i className={'fa-light fa-memo text-white'}/>,
                })
            })

            console.log('setting items', query, tmpItems)
            setItems(tmpItems || [])
            setLoading(false)
        }

        getData();
        // search for page title and url for matched sections
    }, [query]);

    return (
        <Transition.Root show={open} as={Fragment} afterLeave={() => setQuery('')} appear>
            <Dialog as="div" className="relative z-20" onClose={setOpen}>
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
                        <Dialog.Panel
                            className="mx-auto max-w-xl transform divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black ring-opacity-5 transition-all">
                            <Combobox onChange={(item) => {
                                if (item.url){
                                    window.location = `${item.url}#${item.id}`
                                }
                            }}>
                                <div className="relative">
                                    <i
                                        className="fa-light fa-search pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-400"
                                    />
                                    <Combobox.Input
                                        className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-gray-900 placeholder:text-gray-400 focus:ring-0 sm:text-sm"
                                        placeholder="Search..."
                                        onChange={(event) =>{
                                            const match = tags.find(tag => tag.toLowerCase() === event.target.value.toLowerCase());
                                            setTmpQuery(match || event.target.value)
                                        }}
                                    />
                                </div>

                                {tags
                                    .filter(tag => (!tmpQuery?.length || tag.toLowerCase().includes(tmpQuery.toLowerCase())))
                                    .length > 0 && (
                                    <Combobox.Options static
                                                      className="max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3">
                                        <span className={'text-xs italic'}>suggestions: </span>
                                        {tags
                                            .filter(tag => (!tmpQuery?.length || tag.toLowerCase().includes(tmpQuery.toLowerCase())))
                                            .filter((tag, i) => i <= 5)
                                            .map((tag) => (
                                            <Combobox.Option
                                                key={tag}
                                                value={tag}
                                                onClick={() => setQuery(tag)}
                                                className={({active}) =>
                                                    classNames('flex cursor-pointer select-none rounded-xl p-1', active && 'bg-gray-100')
                                                }
                                            >
                                                {({active}) => (
                                                    <div>
                                                        <i className="text-sm text-red-400 fa fa-tag" />
                                                        <span
                                                            className={classNames(
                                                                'ml-2 text-sm font-medium',
                                                                active ? 'text-gray-900' : 'text-gray-700'
                                                            )}
                                                        >
                                                                {tag}
                                                            </span>
                                                    </div>
                                                )}
                                            </Combobox.Option>
                                        ))}
                                    </Combobox.Options>
                                )}

                                {items.length > 0 && (
                                    <Combobox.Options static
                                                      className="max-h-96 transform-gpu scroll-py-3 overflow-y-auto p-3">
                                        {items.map((item) => (
                                            <Combobox.Option
                                                key={item.id}
                                                value={item}
                                                className={({active}) =>
                                                    classNames('flex cursor-pointer select-none rounded-xl p-3', active && 'bg-gray-100')
                                                }
                                            >
                                                {({active}) => (
                                                    <>
                                                        <div
                                                            className={classNames(
                                                                'flex h-10 w-10 flex-none items-center justify-center rounded-lg',
                                                                item.color
                                                            )}
                                                        >
                                                            <item.icon className="h-6 w-6 text-white"
                                                                       aria-hidden="true"/>
                                                        </div>
                                                        <div className="ml-4 flex-auto">
                                                            <p
                                                                className={classNames(
                                                                    'text-sm font-medium',
                                                                    active ? 'text-gray-900' : 'text-gray-700'
                                                                )}
                                                            >
                                                                {item.name || item.id}
                                                            </p>
                                                            <p className={classNames('text-sm', active ? 'text-gray-700' : 'text-gray-500')}>
                                                                {item.description}
                                                            </p>
                                                            <span className={'tracking-wide p-1 bg-red-400 text-xs text-white font-semibold rounded-md border'}>{item.tags}</span>
                                                        </div>
                                                    </>
                                                )}
                                            </Combobox.Option>
                                        ))}
                                    </Combobox.Options>
                                )}

                                {
                                    loading ? (
                                            <div className="p-2 mx-auto w-1/4 h-full flex items-center justify-middle">
                                                <i className="px-2 fa fa-loader text-gray-400" />
                                                <p className="font-semibold text-gray-900">Loading...</p>
                                            </div>
                                        ) :
                                        query !== '' && items.length === 0 && (
                                            <div className="px-6 py-14 text-center text-sm sm:px-14">
                                                <i
                                                    className="fa fa-exclamation mx-auto h-6 w-6 text-gray-400"
                                                />
                                                <p className="mt-4 font-semibold text-gray-900">No results found</p>
                                                <p className="mt-2 text-gray-500">No components found for this search term.
                                                    Please try again.</p>
                                            </div>
                                        )}
                            </Combobox>
                        </Dialog.Panel>
                    </Transition.Child>
                </div>
            </Dialog>
        </Transition.Root>
    )
}