
import React, {useContext} from 'react';
import {ThemeContext, getComponentTheme} from "../../../../../ui/useTheme";
export const CustomBucketsConfigurator = ({ value, setValue, state, setState, dwAPI, mapAPI }) => {
    const { UI, theme: themeFromContext = {} } = useContext(ThemeContext) || {};
    console.log("value custom bucks:", value)
    const { Switch, Pill, Icon, theme, Input } = UI; // Destructure ui for components
    const config = value || {
        alias: "",
        sourceField: "",
        type: "dynamic",
        binding: {
            statePath: "",
            labelKey: "",
            valueKey: ""
        },
        fallback: "Other"
    };

    const updateConfig = (key, val) => {
        setValue({ ...config, [key]: val });
    };

    const updateBinding = (key, val) => {
        setValue({ ...config, binding: { ...config.binding, [key]: val } });
    };

    const addStaticGroup = () => {
        setValue({
            ...config,
            staticGroups: [...(config.staticGroups || []), { label: "", values: "" }]
        });
    };

    const updateStaticGroup = (index, key, val) => {
        const newStaticGroups = [...(config.staticGroups || [])];
        newStaticGroups[index][key] = val;
        setValue({ ...config, staticGroups: newStaticGroups });
    };

    const removeStaticGroup = (index) => {
        const newStaticGroups = [...(config.staticGroups || [])];
        newStaticGroups.splice(index, 1);
        setValue({ ...config, staticGroups: newStaticGroups });
    };

    const columns = state?.columns || []; // Assuming state.columns holds available columns

    return (
        <div className="flex flex-col gap-4 p-2">
            <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Type</label>
                <Switch
                    size="small"
                    enabled={config.type === "dynamic"}
                    setEnabled={(v) => updateConfig("type", v ? "dynamic" : "static")}
                />
                <span className="text-sm text-gray-500">{config.type === "dynamic" ? "Dynamic (Page State)" : "Static (Manual)"}</span>
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Dimension Alias:</label>
                <Input
                    type="text"
                    value={config.alias}
                    onChange={(e) => updateConfig("alias", e.target.value)}
                    placeholder="e.g., route_name"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Source Column/Field:</label>
                {/* For simplicity, starting with a text input. Will consider a dropdown later if necessary */}
                <Input
                    type="text"
                    value={config.sourceField}
                    onChange={(e) => updateConfig("sourceField", e.target.value)}
                    placeholder="e.g., tmc_id"
                />
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">Fallback Label:</label>
                <Input
                    type="text"
                    value={config.fallback}
                    onChange={(e) => updateConfig("fallback", e.target.value)}
                    placeholder="Default: Other"
                />
            </div>

            {config.type === "dynamic" ? (
                <div className="flex flex-col gap-4 border-t pt-4 mt-4">
                    <h3 className="text-md font-semibold">Dynamic Configuration</h3>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700">State Path:</label>
                        <Input
                            type="text"
                            value={config.binding.statePath}
                            onChange={(e) => updateBinding("statePath", e.target.value)}
                            placeholder="e.g., pageState.filters.routes"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700">Label Property:</label>
                        <Input
                            type="text"
                            value={config.binding.labelKey}
                            onChange={(e) => updateBinding("labelKey", e.target.value)}
                            placeholder="e.g., route_name"
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-medium text-gray-700">Value Property:</label>
                        <Input
                            type="text"
                            value={config.binding.valueKey}
                            onChange={(e) => updateBinding("valueKey", e.target.value)}
                            placeholder="e.g., tmc_array"
                        />
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-4 border-t pt-4 mt-4">
                    <h3 className="text-md font-semibold">Static Configuration</h3>
                    {(config.staticGroups || []).map((group, index) => (
                        <div key={index} className="flex flex-col gap-2 p-2 border rounded-md">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-medium text-gray-700">Group {index + 1}</label>
                                <Pill color="red" text={<Icon icon="TrashCan" className="size-4" />} onClick={() => removeStaticGroup(index)} title="Remove Group" />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm text-gray-600">Group Label:</label>
                                <Input
                                    type="text"
                                    value={group.label}
                                    onChange={(e) => updateStaticGroup(index, "label", e.target.value)}
                                    placeholder="e.g., East Coast"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm text-gray-600">Values (CSV):</label>
                                <Input
                                    type="textarea" // Assuming Input component can handle textarea type
                                    value={group.values}
                                    onChange={(e) => updateStaticGroup(index, "values", e.target.value)}
                                    placeholder="e.g., tmc_1, tmc_2, tmc_3"
                                />
                            </div>
                        </div>
                    ))}
                    <Pill color="blue" text={<Icon icon="Plus" className="size-4" />} onClick={addStaticGroup} title="Add Group" />
                </div>
            )}
        </div>
    );
};
