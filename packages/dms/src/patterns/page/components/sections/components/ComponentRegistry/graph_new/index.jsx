import React, {useState, useContext, useEffect} from "react";
import {ComponentContext, PageContext} from "../../../../../context";
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
//TODO this may or may not work with JOINS!!!!
/**
 * Values is an array of object, must always be the following shape:
 * [{label, value}]
 */
export const buildPageFilterColumn = ({colName, values}) => {
  // (CASE 
  //       WHEN ds.tmc IN ('120-50371', '120P05935') THEN 'Group 1'
  //       WHEN ds.tmc IN ('115-04234', '115P04235', '115-04236') THEN 'Group 2'
  //       ELSE 'Unknown Group'
  //   END) as tmc_group
  
  // const groupColName = `${column.name}_filter_group`
  console.log("builda uda filter, column::", {colName, values})
  const valueClauses = values?.map((val, i) => {
      const arrayVal = Array.isArray(val.value) ? val.value : [val.value];
      return `WHEN ${colName} IN (${arrayVal.map((v) => `'${v}'`).join(", ")}) THEN '${val.label}'`
    });
  return `(CASE ${valueClauses.join(" ")} ELSE 'Unknown Group' END) as ${colName}_group`;
}
export const Graph = ({isEdit}) => {
    const {state, setState, controls={}, activeStyle} = useContext(ComponentContext);
    const pageContext = useContext(PageContext);
    const {UI} = useContext(ThemeContext);
    const {AvlGraph} = UI;

    return (
        <AvlGraph isEdit={ isEdit }
            pageContext={ pageContext }
            state={ state }
            setState={ setState }
            controls={ controls }/>
    )
}