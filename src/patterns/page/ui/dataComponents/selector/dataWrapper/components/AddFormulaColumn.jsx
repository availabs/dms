import React, {useState} from "react";
import {Pill} from "./Pill";
import {XMark} from "../../../../icons";
import {getColumnLabel} from "../utils/utils";

const Modal = ({open, setOpen, columns}) => {
    if(!open) return null;

    return (
        <div className={'fixed inset-0 h-full w-full z-[100] content-center'} style={{backgroundColor: '#00000066'}} onClick={() => setOpen(false)}>
            <div className={'w-3/4 h-1/2 overflow-auto scrollbar-sm flex flex-col gap-[12px] p-[16px] bg-white place-self-center rounded-md'} onClick={e => e.stopPropagation()}>
                <div className={'w-full flex justify-end'}>
                    <div className={'w-fit h-fit p-[8px] text-[#37576B] border border-[#E0EBF0] rounded-full cursor-pointer'}
                         onClick={() => setOpen(false)}
                    >
                        <XMark height={12} width={12}/>
                    </div>
                </div>

                <div className={'text-lg'}>Add Formula Column</div>

                <div className={'flex w-full h-full px-2'}>
                    <div className={'w-1/4 h-1/2 overflow-auto scrollbar-sm'}>
                        {
                            columns.map(c => <div className={'hover:bg-blue-100'}>{getColumnLabel(c)}</div>)
                        }
                    </div>
                    <div className={'w-3/4 h-full px-1'}>
                        <div className={'w-full flex gap-1'}>
                            <Pill text={'+'} color={'blue'} onClick={() => {}} />
                            <Pill text={'-'} color={'blue'} onClick={() => {}} />
                            <Pill text={'/'} color={'blue'} onClick={() => {}} />
                            <Pill text={'()'} color={'blue'} onClick={() => {}} />
                        </div>
                    </div>
                </div>
                <button className={'px-2 py-1 bg-blue-500/15 text-blue-700 hover:bg-blue-500/25'}
                        onClick={() => {}}>
                    Add
                </button>
            </div>
        </div>
    )
}
export const AddFormulaColumn = ({columns=[]}) => {
    const [open, setOpen] = useState(false);
    return (
        <div className={'relative'}>
            <Pill text={'+ Formula column'} color={'blue'} onClick={() => setOpen(true)}/>
            <Modal open={open} setOpen={setOpen} columns={columns}/>
        </div>
    )
}