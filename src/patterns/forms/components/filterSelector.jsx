import Multiselect from "~/component_registry/shared/MultiSelect.jsx";
import {useState} from "react";

export const FilterSelector = ({filters, setFilters, columns, uniqueValues}) => {
    const [newFilterCol, setNewFilterCol] = useState();
    console.log('?', newFilterCol, filters, columns.map(c => c.accessor))
    return (
        <>
            <div className={'w-full pt-2 mt-1 flex flex-row text-sm'}>
                <label className={'shrink-0 pr-2 py-2 my-1 w-1/4'}>Add filter for:</label>
                <select
                    className={'p-2 ml-0 my-1 bg-white rounded-md w-full shrink'}
                    key={`filter`}
                    onChange={e => setNewFilterCol(e.target.value)}
                    value={undefined}
                >
                    <option unselectable={"on"} value={undefined}>Select a Column to filter</option>
                    {
                        columns.filter(column => !filters.hasOwnProperty(column.accessor)).map(column => <option key={column.Header} value={column.accessor}>{column.Header}</option>)
                    }
                </select>
                <button
                    className={'px-4 my-1 bg-blue-300 hover:bg-blue-500 rounded-md'}
                    onClick={e => {
                        setFilters({...filters, [newFilterCol]: undefined})
                        setNewFilterCol(undefined)
                    }}
                    title={'Add Filter'}
                >Add
                </button>
            </div>
            {
                Object.keys(filters).map(column => (
                    <div className={'w-full pt-2 mt-1 flex flex-row text-sm items-top'}>
                        <label className={'shrink-0 pr-2 py-2 my-1 w-1/4 font-medium'}>{columns.find(c => c.accessor === column)?.Header}</label>
                        <div className={'p-2 ml-0 my-1 bg-white rounded-md w-full shrink'}>
                            <Multiselect
                                className={'flex-row-reverse'}
                                value={filters[column]}
                                options={uniqueValues[column].map(uv => ({key: uv, label: uv}))}
                                onChange={e => setFilters({...filters, [column]: e.map(e1 => e1.key)})}
                                noLabel={true}
                            />
                        </div>
                        <button
                            className={'my-1 px-2 py-2 h-fit bg-red-300 hover:bg-red-500 rounded-md'}
                            onClick={e => {
                                const newFilters = {...filters}
                                delete newFilters[column]
                                setFilters(newFilters)
                            }}
                            title={'Remove Filter'}
                        >Remove</button>
                    </div>
                ))
            }
        </>
    )
}