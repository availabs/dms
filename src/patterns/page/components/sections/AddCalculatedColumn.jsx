import React, {useContext, useState} from "react";
import { useImmer } from "use-immer";
import { ThemeContext } from "../../../../ui/useTheme";

const Modal = ({ open, setOpen, columns, addCalculatedColumn }) => {
  const { UI } = useContext(ThemeContext);
    const {Icon} = UI;
    if (!open) return null;
    const [state, setState] = useImmer({
     type: 'calculated',
        show: true
    });

    // Save and close modal
    const handleSave = () => {
        addCalculatedColumn(state);
        setOpen(false);
    };
    const isValidSql = true;

    return (
        <div className="fixed inset-0 h-full w-full z-100 content-center bg-black/40" onClick={() => setOpen(false)}>
            <div className="w-3/4 h-1/2 overflow-auto flex flex-col gap-3 p-4 bg-white place-self-center rounded-md" onClick={(e) => e.stopPropagation()}>
                <div className="w-full flex justify-end">
                    <div className="p-2 text-[#37576B] border border-[#E0EBF0] rounded-full cursor-pointer" onClick={() => setOpen(false)}>
                        <Icon icon={'XMark'} height={12} width={12} />
                    </div>
                </div>

                <div className="text-lg font-semibold">Add Calculated Column</div>
                    <div className="w-full h-full px-2 flex flex-col gap-1">
                        <input className={'p-1 text-gray-400'} placeholder={'Please enter sql...'} value={state.name} onChange={e => setState(draft => {draft.name = e.target.value})}/>
                        <div className={'flex gap-1 place-self-end'}>
                            {/* Clear Button */}
                            <button className="px-3 py-1 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 rounded" onClick={() => {
                                setState(draft => {
                                    draft.name = '';
                                })
                            }}>
                                Clear
                            </button>
                            {/* Save Button */}
                            <button disabled={!isValidSql} className={`px-3 py-1 ${isValidSql ? `bg-blue-500/15 hover:bg-blue-500/25` : `bg-gray-200`} text-blue-700 rounded`} onClick={handleSave}>
                                Add
                            </button>
                        </div>
                    </div>
            </div>
        </div>
    );
};

const AddCalculatedColumn = ({columns=[], addCalculatedColumn}) => {
    const [open, setOpen] = useState(false);
    const {UI} = useContext(ThemeContext);
    const {Pill} = UI;
    return (
        <>
            <Pill text={'+ Calculated'} color={'blue'} onClick={() => setOpen(true)}/>
            <Modal open={open} setOpen={setOpen} columns={columns} addCalculatedColumn={addCalculatedColumn}/>
        </>
    )
}

export default AddCalculatedColumn
