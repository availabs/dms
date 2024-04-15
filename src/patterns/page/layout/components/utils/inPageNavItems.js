import {getCurrentDataItem} from "./navItems.js";

const levelClasses = {
    '1': ' pt-2 pb-1 uppercase text-sm text-blue-400 hover:underline cursor-pointer border-r-2 mr-4',
    '2': 'pl-2 pt-2 pb-1 uppercase text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4',
    '3': 'pl-4 pt-2 pb-1 text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4',
    '4': 'pl-6 pt-2 pb-1 text-sm text-slate-400 hover:underline cursor-pointer border-r-2 mr-4',

}

const parseData = data => !data ? {} : typeof data === "object" ? data : JSON.parse(data)?.text

export function getInPageNav(item, edit = false) {
    const currentDI = item

   
    const menuItems = (currentDI?.sections || []).reduce((acc, {title, element, level = '1', ...props}) => {

        if (!element || !title || level === '0' ) return acc;

        const lexicalNavElements =
            element['element-type'] === 'lexical' || !element['element-type'] ?
            parseData(element['element-data'])?.root?.children?.reduce((acc, {type, tag, children, ...rest}) => {

                const heading = type === 'heading' && children[0]?.text?.length ?
                    [
                        {
                            name: children[0]?.text,
                            onClick: (e) => {
                                const elmntToView =
                                    [...window.document.querySelectorAll(tag)]
                                        .find(headerElement => headerElement?.children[0]?.innerHTML === children[0]?.text);
                                // .__lexicalKey_cgviu
                                elmntToView?.scrollIntoView({ behavior: "smooth"});
                            },
                            className: `pl-2 pr-4 pb-1 text-sm text-slate-400 hover:text-slate-700 cursor-pointer border-r-2 mr-4
                            ${
                                [...window.document.querySelectorAll(tag)]
                                    .find(headerElement => headerElement?.children[0]?.innerHTML === children[0]?.text)?.offsetParent 
                                === null ? 'text-blue-200' : ''
                            }`
                        }
                    ] : []

                
                return [...acc, ...heading]
            }, []) : []

        return [
            ...acc,
            {
                name: title,
                onClick: (e) => {
                    const elmntToView = window.document.getElementById(`#${title?.replace(/ /g, '_')}`);
                    elmntToView?.scrollIntoView({ behavior: "smooth" });
                },
                className: levelClasses[level]
            },
            ...(lexicalNavElements || [])
        ]
    }, [])

    return {
        menuItems: menuItems,
        themeOptions: {
            size: 'full',
            color: 'transparent'
        }
    };
}