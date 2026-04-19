import React, {useState, useContext} from "react";
import {ComponentContext} from "../../../../../context";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import {InputControl} from "../../dataWrapper/components/InputControl";

export const DomainEditor = ({value, setValue, display}) => {
    const [newTick, setNewTick] = useState('');
    const {UI} = useContext(ThemeContext);
    const {Icon} = UI;

    return display.useCustomXDomain ? (
        <div className={'flex flex-col gap-0.5'}>
            {(value || []).map((tick, i) =>
                <div key={i} className={'flex gap-0.5 items-center'}>
                    <InputControl value={tick} setValue={v => setValue(display.xDomain.map((d, ii) => i === ii ? v : d))}/>
                    <Icon icon={'TrashCan'} className={'size-6 text-red-500 hover:text-red-700 cursor-pointer'}
                          onClick={() => setValue(value.filter((_, ii) => i !== ii))}/>
                </div>
            )}
            <div className={'flex gap-0.5 items-center'}>
                <InputControl value={newTick} setValue={v => setNewTick(v)} onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        setValue([...(value || []), newTick]);
                        setNewTick('');
                    }
                }} placeHolder={'tick'}/>
                <Icon icon={'CirclePlus'} className={'size-6 text-blue-500 hover:text-blue-700 cursor-pointer'}
                      tabIndex={0}
                      onClick={() => {
                          setValue([...(value || []), newTick]);
                          setNewTick('');
                      }}/>
            </div>
        </div>
    ) : null;
};

export const Graph = ({isEdit}) => {
    const {state, setState, controls={}} = useContext(ComponentContext);
    const {UI} = useContext(ThemeContext);
    const {Graph} = UI;

    return <Graph {...state} setState={setState} controls={controls} isEdit={isEdit} />
}

