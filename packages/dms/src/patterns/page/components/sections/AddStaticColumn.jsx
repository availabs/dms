import React, { useContext, useState } from "react";
import { useImmer } from "use-immer";
import { ThemeContext } from "../../../../ui/useTheme";
import Input from "../../../../ui/components/Input";

const Modal = ({ open, setOpen, addStaticColumn }) => {
    const { UI } = useContext(ThemeContext);
    const { Icon } = UI;
    if (!open) return null;
    const [state, setState] = useImmer({
        display_name: '',
        staticValue: '',
    });

    const isValid = !!state.display_name.trim();

    const handleSave = () => {
        if (!isValid) return;
        const name = `static_${state.display_name.trim().toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
        addStaticColumn({
            name,
            display_name: state.display_name.trim(),
            staticValue: state.staticValue,
            origin: 'static',
            show: true,
        });
        setOpen(false);
    };

    const handleClear = () => {
        setState(draft => {
            draft.display_name = '';
            draft.staticValue = '';
        });
    };

    return (
        <div className="fixed inset-0 h-full w-full z-100 content-center bg-black/40" onClick={() => setOpen(false)}>
            <div className="w-3/4 h-1/2 overflow-auto flex flex-col gap-3 p-4 bg-white place-self-center rounded-md" onClick={(e) => e.stopPropagation()}>
                <div className="w-full flex justify-between items-center">
                    <div className="text-lg font-semibold">Add Static Column</div>
                    <div className="p-2 text-[#37576B] border border-[#E0EBF0] rounded-full cursor-pointer" onClick={() => setOpen(false)}>
                        <Icon icon={'XMark'} height={12} width={12} />
                    </div>
                </div>

                <div className="w-full h-full px-2 flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Display name</label>
                        <Input
                            placeholder="e.g. Category"
                            value={state.display_name}
                            onChange={e => setState(draft => { draft.display_name = e.target.value; })}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Static value</label>
                        <Input
                            placeholder="Value shown for every row"
                            value={state.staticValue}
                            onChange={e => setState(draft => { draft.staticValue = e.target.value; })}
                        />
                    </div>
                    <div className={'flex gap-1 place-self-end'}>
                        <button className="px-3 py-1 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 rounded" onClick={handleClear}>
                            Clear
                        </button>
                        <button disabled={!isValid} className={`px-3 py-1 ${isValid ? `bg-blue-500/15 hover:bg-blue-500/25` : `bg-gray-200`} text-blue-700 rounded`} onClick={handleSave}>
                            Add
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AddStaticColumn = ({ addStaticColumn }) => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                className={`px-2 py-1 text-xs border rounded hover:bg-purple-50 text-purple-600 border-purple-300 ${open ? 'bg-purple-100' : ''}`}
                onClick={() => setOpen(true)}
            >
                + Static
            </button>
            <Modal open={open} setOpen={setOpen} addStaticColumn={addStaticColumn} />
        </>
    );
};

export default AddStaticColumn;
