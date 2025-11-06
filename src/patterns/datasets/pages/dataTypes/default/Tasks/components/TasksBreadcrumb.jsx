import React, {useEffect, useMemo} from 'react';

import {DatasetsContext} from '../../../../../context'

import {ETL_CONTEXT_ATTRS} from '../TaskList'
import {Link, useParams} from 'react-router'
import get from 'lodash/get'

export const getAttributes = (data) => {
    return Object.entries(data || {})
        .reduce((out, attr) => {
            const [k, v] = attr
            typeof v.value !== 'undefined' ?
                out[k] = v.value :
                out[k] = v
            return out
        }, {})
}

export const TasksBreadcrumb = ({fullWidth, params}) => {
    const {etl_context_id} = params
    const {pgEnv, baseUrl, falcor, UI} = React.useContext(DatasetsContext)
    const [name, setName] = React.useState('');
    const {Icon} = UI;

    useEffect(() => {
        async function fetchData() {
            const data = await falcor.get([
                "dama",
                pgEnv,
                "etlContexts",
                "byEtlContextId",
                etl_context_id,
                "attributes",
                ETL_CONTEXT_ATTRS,
            ])
            const etlAttr = getAttributes(
                get(data,
                    [
                        "json",
                        "dama",
                        pgEnv,
                        "etlContexts",
                        "byEtlContextId",
                        etl_context_id,
                    ],
                    {attributes: {}}
                )
            );

            if (Object.keys(etlAttr).length) {
                const namePath = [
                    "dama",
                    pgEnv,
                    "sources",
                    "byId",
                    [etlAttr?.meta?.source_id],
                    "attributes",
                    "name",
                ];
                const nameRes = await falcor.get(namePath);

                const name = get(nameRes, ['json', ...namePath])
                setName(name);
            }
        }

        if (etl_context_id) {
            fetchData();
        }
    }, [falcor, etl_context_id, pgEnv]);

    return (
        <nav className="border-b border-gray-200 flex " aria-label="Breadcrumb">
            <ol className={`${fullWidth ? `w-full` : `w-full mx-auto`}  px-4 flex space-x-4 sm:px-6 lg:px-8`}>
                <li className="flex">
                    <div className="flex items-center">
                        <Link to={baseUrl || '/'} className={"hover:text-[#bbd4cb] text-[#679d89]"}>
                            <Icon icon={'Database'} className={"text-slate-400 hover:text-slate-500 size-4"}/>
                            <span className="sr-only">Home</span>
                        </Link>
                    </div>
                </li>
                <li className="flex">
                    <div className="flex items-center">
                        <svg
                            className="flex-shrink-0 w-6 h-full text-gray-300"
                            viewBox="0 0 30 44"
                            preserveAspectRatio="none"
                            fill="currentColor"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-hidden="true"
                        >
                            <path d="M.293 0l22 22-22 22h1.414l22-22-22-22H.293z"/>
                        </svg>
                        <Link to={`${baseUrl}/tasks`}
                              className={"ml-4 text-sm font-medium text-gray-500 hover:text-gray-700"}>
                            All Tasks
                        </Link>
                    </div>
                </li>
                {[{name}].map((page, i) => (
                    <li key={i} className="flex">
                        <div className="flex items-center">
                            <svg
                                className="flex-shrink-0 w-6 h-full text-gray-300"
                                viewBox="0 0 30 44"
                                preserveAspectRatio="none"
                                fill="currentColor"
                                xmlns="http://www.w3.org/2000/svg"
                                aria-hidden="true"
                            >
                                <path d="M.293 0l22 22-22 22h1.414l22-22-22-22H.293z"/>
                            </svg>
                            {page.href ?
                                <Link
                                    to={page.href}
                                    className="ml-4 text-sm font-medium text-gray-500 hover:text-gray-700"
                                    aria-current={page.current ? 'page' : undefined}
                                >
                                    {page.name}
                                </Link> :
                                <div
                                    className="ml-4 text-sm font-medium text-gray-500 hover:text-gray-700"
                                    aria-current={page.current ? 'page' : undefined}
                                >
                                    {page.name}
                                </div>
                            }
                        </div>
                    </li>
                ))}
            </ol>
        </nav>
    )
}
