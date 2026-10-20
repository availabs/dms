import React, {useState, useContext, useId} from "react";
import {ComponentContext, PageContext} from "../../../../../context";
import { ThemeContext } from "../../../../../../../ui/useTheme";
import {InputControl} from "../../dataWrapper/components/InputControl";

// The chart description field in the graph settings (2026-10-16: UI.FieldLabel + UI.Textarea, were a raw span +
// textarea in graph_new/config.jsx's control function).
export const DescriptionField = ({ value, setValue }) => {
    const { UI } = useContext(ThemeContext) || {};
    const id = useId();
    return (
        <div className='flex flex-col gap-0.5 w-full'>
            <UI.FieldLabel activeStyle="inline" htmlFor={id} text="Description" />
            <UI.Textarea id={id} rows={3} value={value || ''} onChange={e => setValue(e.target.value)} />
        </div>
    );
};

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
    const {state, setState, controls={}, activeStyle} = useContext(ComponentContext);
    const pageContext = useContext(PageContext);
    const {UI} = useContext(ThemeContext);
    const {Graph} = UI;

    return (
        <Graph isEdit={ isEdit }
            pageContext={ pageContext }
            state={ state }
            setState={ setState }
            controls={ controls }
            activeStyle={ activeStyle }/>
    )
}