import React, {useContext, useState} from "react";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";
import { isEqual } from "lodash-es";
import { parseIfJSON } from "../../../../page/pages/_utils";

// Normalise raw filters value (flat array or subdomain-keyed object) → subdomain-keyed object
function normaliseFilters(raw) {
    const parsed = parseIfJSON(raw, []);
    if (Array.isArray(parsed)) return { "*": parsed };
    if (parsed && typeof parsed === 'object') return parsed;
    return { "*": [] };
}

// Renders the filter rows (searchKey / values / remove) for a single subdomain
function FilterRows({ filters = [], onChange }) {
    const { UI } = useContext(ThemeContext);
    const { FieldSet, Button } = UI;
    const [newFilter, setNewFilter] = useState({});
    const customTheme = { field: 'pb-2 flex flex-col' };
    const customThemeButton = { field: 'pb-2 place-content-end' };

    return (
        <div className="flex flex-col gap-1">
            {filters.map((filter, i) => (
                <FieldSet
                    key={filter.id || i}
                    className={'grid grid-cols-3 gap-1'}
                    components={[
                        {
                            label: 'Search Key',
                            type: 'Input',
                            placeholder: 'search key',
                            value: filter.searchKey,
                            onChange: e => onChange(filters.map((v, idx) => idx === i ? { ...v, searchKey: e.target.value } : v)),
                            customTheme
                        },
                        {
                            label: 'Search Value',
                            type: 'Input',
                            placeholder: 'search value',
                            value: filter.values,
                            onChange: e => onChange(filters.map((v, idx) => idx === i ? { ...v, values: e.target.value } : v)),
                            customTheme
                        },
                        {
                            type: 'Button',
                            children: 'remove',
                            customTheme: customThemeButton,
                            onClick: () => onChange(filters.filter((_, idx) => idx !== i))
                        }
                    ]}
                />
            ))}
            <FieldSet
                className={'grid grid-cols-3 gap-1'}
                components={[
                    {
                        label: 'Search Key',
                        type: 'Input',
                        placeholder: 'search key',
                        value: newFilter.searchKey || '',
                        onChange: e => setNewFilter({ ...newFilter, searchKey: e.target.value }),
                        customTheme
                    },
                    {
                        label: 'Search Value',
                        type: 'Input',
                        placeholder: 'search value',
                        value: newFilter.values || '',
                        onChange: e => setNewFilter({ ...newFilter, values: e.target.value }),
                        customTheme
                    },
                    {
                        type: 'Button',
                        children: 'add',
                        customTheme: customThemeButton,
                        onClick: () => {
                            const id = crypto.randomUUID();
                            onChange([...filters, { id, ...newFilter }]);
                            setNewFilter({});
                        }
                    }
                ]}
            />
            <Button onClick={() => onChange([])}>clear all filters</Button>
        </div>
    );
}

export const PatternFilterEditor = ({ value = {}, onChange, ...rest }) => {
    const { UI } = useContext(ThemeContext);
    const { apiUpdate } = useContext(AdminContext);
    const { FieldSet } = UI;

    const normalised = normaliseFilters(value?.filters);
    const [tmpFilters, setTmpFilters] = useState(normalised);
    const [newSubdomain, setNewSubdomain] = useState('');

    const updateSubdomainFilters = (subdomain, filters) => {
        setTmpFilters(prev => ({ ...prev, [subdomain]: filters }));
    };

    const removeSubdomain = (subdomain) => {
        setTmpFilters(prev => {
            const next = { ...prev };
            delete next[subdomain];
            return next;
        });
    };

    const addSubdomain = () => {
        const key = newSubdomain.trim();
        if (!key || tmpFilters[key] !== undefined) return;
        setTmpFilters(prev => ({ ...prev, [key]: [] }));
        setNewSubdomain('');
    };

    return (
        <div className={'flex flex-col gap-2 p-1 border rounded-md max-w-5xl'}>
            <label className={'text-sm font-medium'}>Filters</label>

            {Object.entries(tmpFilters).map(([subdomain, filters]) => (
                <div key={subdomain} className="flex flex-col gap-1 border rounded p-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold bg-gray-100 px-2 py-0.5 rounded">
                            subdomain: {subdomain === '*' ? 'none' : subdomain}
                        </span>
                        {subdomain !== '*' && (
                            <button
                                className="text-xs text-red-500 hover:text-red-700"
                                onClick={() => removeSubdomain(subdomain)}
                            >
                                remove subdomain
                            </button>
                        )}
                    </div>
                    <FilterRows
                        filters={filters}
                        onChange={(updated) => updateSubdomainFilters(subdomain, updated)}
                    />
                </div>
            ))}

            <div className="flex gap-2 items-center mt-1">
                <input
                    className="border rounded px-2 py-1 text-sm"
                    placeholder="subdomain name"
                    value={newSubdomain}
                    onChange={e => setNewSubdomain(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSubdomain()}
                />
                <button
                    className="border rounded px-3 py-1 text-sm hover:bg-gray-50"
                    onClick={addSubdomain}
                >
                    Add subdomain
                </button>
            </div>

            <FieldSet
                className={'grid grid-cols-12 gap-1 border rounded p-4'}
                components={[
                    {
                        type: 'Spacer',
                        customTheme: { field: 'bg-white col-span-10 ' }
                    },
                    {
                        type: 'Button',
                        children: <span>Reset</span>,
                        buttonType: 'plain',
                        disabled: isEqual(tmpFilters, normalised),
                        onClick: () => setTmpFilters(normalised),
                        customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    },
                    {
                        type: 'Button',
                        children: <span>Save</span>,
                        disabled: isEqual(tmpFilters, normalised),
                        onClick: () => apiUpdate({ data: { id: value.id, filters: tmpFilters } }),
                        customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                    }
                ]}
            />
        </div>
    );
};
