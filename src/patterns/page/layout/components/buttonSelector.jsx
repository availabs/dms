import React, {useEffect} from "react";

 const ButtonSelector = ({
                                   label,
                                   types,
                                   type,
                                   setType,
                                   multi = false,
                                   size = 'small',
                                   disabled,
                                   disabledTitle,
                                   autoSelect= true
                               }) => {
    useEffect(() => {
        const initValue = types[0]?.value || types[0];
        if(!initValue || !autoSelect || disabled) return;

        const initType = multi ? [initValue] : initValue;

        (!type || (Array.isArray(type) && !type.filter(t => t)?.length)) && setType(initType)
    },[types])
    return (
        <div className={`my-1 flex flex-rows flex-wrap`}
             title={disabled ? disabledTitle : null}
        >
            {
                label && <div className={'p-2 pl-0 w-1/4'}>{label}</div>
            }
            <span className={`
              
                space-x-1 rounded-lg bg-slate-100 py-0.5
                flex flex-row flex-wrap
                shadow-sm 
                ${size === 'large' ? `w-full` : 'w-fit'}`}>
                {
                    types.map((t, i) => {
                        const currentValue = t?.value || t;
                        const currentType =
                            multi && Array.isArray(type) ? type :
                                multi && !Array.isArray(type) ? [type] :
                                    !multi && Array.isArray(type) ? type[0] :
                                        type;

                        const isActive = (multi && currentType?.includes(currentValue)) || (!multi && currentType === currentValue);

                        return (
                            <button
                                type="button"
                                key={i}
                                className={`
                            ${i !== 0 && `-ml-px`} 
                            ${disabled && `pointer-events-none`}
                            rounded-lg py-[0.4375rem] break-none
                            ${isActive ? `text-gray-900 bg-white shadow` : `text-gray-700`} hover:text-blue-500
                            min-w-[60px] min-h-[30px] uppercase
                            relative items-center px-2 text-xs items-center justify-center text-center 
                            focus:z-10`}
                                onClick={() => {
                                    const value =
                                        multi && currentType?.includes(currentValue) ? currentType.filter(v => v !== currentValue) :
                                            multi && !currentType?.includes(currentValue) ? [...currentType, currentValue] :
                                                currentValue;

                                    setType(value);
                                }}
                            >
                                {t?.label || t}
                            </button>
                        )
                    })
                }
                </span>
        </div>
    )
}

export default ButtonSelector