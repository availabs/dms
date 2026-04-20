import {convert} from './convertToSpreadSheet'
import {v4 as uuidv4} from "uuid";

export const handlePaste = async (e, setKey, setState, value, onChange) => {
    e.preventDefault();
    try {
        const text = await navigator.clipboard.readText();
        const copiedValue = isJson(text) && JSON.parse(text || '{}');

        if (!copiedValue || !copiedValue['element']?.['element-type']) return;
        const elementData = copiedValue['element']['element-data'];
        setKey(copiedValue['element']['element-type']) // mainly for lexical so it updates with value
        setState(isJson(elementData) ? JSON.parse(elementData) : elementData) // state inits with element-data from prop. need to update on paste.
        const pastedValue = {}

        Object.keys(copiedValue)
            .filter(key => !['id', 'ref'].includes(key))
            .map(key => {
                pastedValue[key] = copiedValue[key]
            })

        onChange({...value, ...pastedValue});
    } catch (e) {
        console.error('<paste>', e)
    }
}

export const getHelpTextArray = (value, isEdit) => {
  const helpText = Array.isArray(value?.['helpText']) ?
      value?.['helpText'] :
      value?.['helpText']?.text ?
          [value?.['helpText']] :
          value?.helpText ?
              [{text: value?.['helpText']}] :
              [];

  return isEdit ? helpText : helpText.filter(({visibility}) => visibility !== 'edit')
}

export const isJson = (str) => {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
}

export const handleCopyToClipboard = (value) => {
    navigator.clipboard.writeText(value)
}

export const handleCopy = (value) => {
    const elementType = value?.element?.['element-type'];
    //--------------------------------------
    // Temp Code to migrate off cenrep II
    //--------------------------------------
    if (elementType === 'Table: Cenrep II') {
        const spreadsheetData = convert(JSON.parse(value.element['element-data']));
        const ssElement = {
            ...value,
            element: {'element-type': 'Spreadsheet', 'element-data': JSON.stringify(spreadsheetData)}
        };
        console.log(ssElement);
       handleCopyToClipboard(JSON.stringify(ssElement))
        return;
    }

    handleCopyToClipboard(JSON.stringify(value))
}

export const initialState = defaultState => {
    if(defaultState && Object.keys(defaultState).length) return defaultState;

    return {
        // user controlled part
        columns: [
            //     visible columns or Actions
            //     {name, display_name, custom_name,
            //      justify, width, fn,
            //      groupBy: t/f, orderBy: t/f, excludeNull: t/f, openOut: t/f,
            //      formatFn, fontSize, hideHeader, cardSpan,
            //      isLink: t/f, linkText: ‘’, linkLocation: ‘’, actionName, actionType, icon,
            //      }
        ],
        display: {
            usePageFilters: false,
            usePagination: true,
            pageSize: 5,
            totalLength: 0,
            showGutters: false,
            transform: '', // transform fn to be applied
            loadMoreId:`id${uuidv4()}`,
            showAttribution: true,
        },
        // wrapper controlled part
        filters: { op: 'AND', groups: [] },
        // lastDataRequest: {},
        data: [],
        externalSource: {
            columns: [],
            // pgEnv,
            // source_id
            // view_id
            // version,
            // doc_type, type -- should be the same
        }
    }
}
