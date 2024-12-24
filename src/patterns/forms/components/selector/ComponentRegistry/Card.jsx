
import {getData} from "./spreadsheet/utils/utils";
import SpreadSheet from "./spreadsheet";

export const Card = ({data, visibleAttributes, attributes, customColNames}) => {
    console.log('data', data,
        visibleAttributes,
        attributes
    )
    // todo render in header controls here. from spreadsheet, only pass setters in edit mode
    return (
        <div className={'w-full flex gap-2'}>
            {
                visibleAttributes
                    .map(attr => attributes.find(a => a.name === attr) || {name: attr})
                    .map(attr => (
                    <div key={attr.name} className={'w-full p-2 rounded-md border shadow'}>
                        <div className={'w-full text-gray-500 capitalize text-center'}>{customColNames[attr.name] || attr.display_name || attr.name}</div>
                        <div className={'w-full text-gray-900 font-semibold text-center'}>{data?.[0]?.[attr.name]}</div>
                    </div>
                ))
            }
        </div>
    )
}

export default {
    "name": 'Card',
    "type": 'card',
    "variables": [],
    getData,
    "EditComp": props => <SpreadSheet.EditComp {...props} renderCard={true} />,
    "ViewComp": props => <SpreadSheet.ViewComp {...props} renderCard={true} />,
}