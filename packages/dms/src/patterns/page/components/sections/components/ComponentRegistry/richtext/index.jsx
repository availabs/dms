import {useContext, useEffect, useState, useMemo} from "react";
import {isEqual} from 'lodash-es';
import { ThemeContext } from "../../../../../../../ui/useTheme";
import { CMSContext, ComponentContext } from "../../../../../context";

const isJson = (str)  => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

const collabColors = ['#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#d19a66'];
function emailToColor(email) {
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
        hash = ((hash << 5) - hash) + email.charCodeAt(i);
        hash |= 0;
    }
    return collabColors[Math.abs(hash) % collabColors.length];
}

export const RichtextEdit = ({value, onChange}) => {
    const { theme, UI } = useContext(ThemeContext)
    const { state, setState, sectionId } = useContext(ComponentContext);
    const { user, fileUploadInfo } = useContext(CMSContext) || {};
    const { ColumnTypes: {lexical: Lexical}} = UI;

    // Enable collaborative editing when sync WebSocket is connected
    const isCollab = sectionId && globalThis.__dmsSyncAPI?.isCollabReady?.();
    const collabId = isCollab ? String(sectionId) : undefined;
    const collabUsername = isCollab && user?.email ? user.email : undefined;
    const collabCursorColor = isCollab && user?.email ? emailToColor(user.email) : undefined;

    // Text content is stored separately from display settings
    const cachedData = value && isJson(value) ? JSON.parse(value) : {};
    // Get settings from ComponentContext.state.display (managed by controls)
    const isCard = cachedData?.isCard || state?.display?.isCard || '';
    const bgColor = cachedData?.bgColor || state?.display?.bgColor || 'rgba(0,0,0,0)';
    const showToolbar = cachedData?.showToolbar || state?.display?.showToolbar || false;
    const [text, setText] = useState(cachedData?.text || (value?.root ? value : ''));

    // Sync state.display changes and text to element-data via onChange
    useEffect(() => {
        const newData = {
            bgColor: state?.display?.bgColor || 'rgba(0,0,0,0)',
            isCard: state?.display?.isCard || '',
            showToolbar: state?.display?.showToolbar || false,
            text
        };
        const currentData = value && isJson(value) ? JSON.parse(value) : {};

        if (!isEqual(newData, {bgColor: currentData.bgColor, isCard: currentData.isCard, showToolbar: currentData.showToolbar, text: currentData.text})) {
            onChange(JSON.stringify(newData));
        }
    }, [state?.display?.bgColor, state?.display?.isCard, state?.display?.showToolbar, text]);

    // Initialize state.display from saved data on mount
    useEffect(() => {
        if (cachedData?.isCard !== undefined || cachedData?.bgColor !== undefined || cachedData?.showToolbar !== undefined) {
            setState(draft => {
                if (!draft.display) draft.display = {};
                if (cachedData.isCard !== undefined && !draft.display.isCard && cachedData.isCard !== draft.display.isCard) {
                    draft.display.isCard = cachedData.isCard;
                }
                if (cachedData.bgColor !== undefined && !draft.display.bgColor && cachedData.bgColor !== draft.display.bgColor) {
                    draft.display.bgColor = cachedData.bgColor;
                }
                if (cachedData.showToolbar !== undefined && !draft.display.showToolbar && cachedData.showToolbar !== draft.display.showToolbar) {
                    draft.display.showToolbar = cachedData.showToolbar;
                }
            });
        }
    }, []);

    return (
        <div className='w-full'>
            <div className='relative'>
                <div className='flex'>
                    {isCard === 'Handwritten' && <div className='w-[50px]'> {'<---'} </div>}
                    <div className='flex-1'>
                        <Lexical.EditComp
                            value={text}
                            onChange={setText}
                            bgColor={bgColor}
                            hideControls={!showToolbar}
                            styleName={isCard || undefined}
                            isCollab={isCollab}
                            collabId={collabId}
                            collabUsername={collabUsername}
                            collabCursorColor={collabCursorColor}
                            fileUploadInfo={ fileUploadInfo }
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

RichtextEdit.settings = {
    hasControls: true,
    name: 'ElementEdit'
}

export const RichtextView = ({value}) => {
  const { theme , UI } = useContext(ThemeContext)
  // console.log('richtext view - UI', UI)
  const { ColumnTypes: { lexical: Lexical } } = UI;
    if (!value) return <div className='h-6' />
    let data = typeof value === 'object' ?
        value['element-data'] :
        JSON.parse(value)
    const dataOrValue = data?.text || value;
    const isCard = data?.isCard

    //console.log('richtext view ', isCard, data)
    if(!dataOrValue || !dataOrValue?.root ||
        (dataOrValue?.root?.children?.length === 1 && dataOrValue?.root?.children?.[0]?.children?.length === 0) ||
        (dataOrValue?.root?.children?.length === 0)
    ) return <div className='h-6' />;



    return (
        <div className='flex'>
            {['Handwritten', 'Handwritten_1', 'Handwritten_2', 'Handwritten_3'].includes(isCard)  && <div className='pt-2 pr-2'><img src='/themes/mny/handwritten_arrow.svg'/></div>}
            <div className='flex-1'>
            <Lexical.ViewComp
                value={dataOrValue}
                bgColor={data?.bgColor}
                styleName={isCard || undefined}
            />
            </div>
        </div>
    )
}


