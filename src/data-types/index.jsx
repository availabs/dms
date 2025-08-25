import React from 'react'
import Text from './text'
import textarea from './textarea'
import boolean from './boolean'
import dmsFormat from './dms-format'
import Array from './array'
import Lexical from '../patterns/page/components/selector/ComponentRegistry/richtext/lexical'
import { get } from "lodash-es"
import Multiselect from "./multiselect";
import Radio from "./radio";
import Checkbox from "./checkbox";
import Switch from "../ui/components/Switch";

export const dmsDataTypes = {
	'text': Text,
    'textarea': textarea,
    'lexical': Lexical,
    'number': {
        EditComp: (props) => <Text.EditComp {...props} type={'number'} />,
        ViewComp: (props) => <Text.ViewComp {...props} type={'number'} />,
    },
    'date': {
        EditComp: (props) => <Text.EditComp {...props} type={'date'} />,
        ViewComp: (props) => <Text.ViewComp {...props} type={'date'} />,
    },
    'timestamp': {
        EditComp: (props) => <Text.EditComp {...props} type={'datetime-local'} />,
        ViewComp: (props) => <Text.ViewComp {...props} type={'datetime-local'} />,
    },
	'boolean': boolean,
	'dms-format': dmsFormat,
	'select': {
        EditComp: (props) => <Multiselect.EditComp {...props} singleSelectOnly={true} />,
        ViewComp: (props) => <Multiselect.ViewComp {...props} singleSelectOnly={true} />,
    },
	'multiselect': Multiselect,
	'radio': Radio,
    'checkbox': Checkbox,
    'switch': {
        EditComp: ({trueValue=true, value, onChange, ...props}) =>
            <Switch {...props} enabled={value === trueValue}
                    setEnabled={e => onChange(e ? trueValue : false)}
                    size={'small'}
            />,
        ViewComp: ({trueValue=true, onChange, value, ...props}) =>
            <Switch {...props} enabled={value === trueValue} disabled={true} size={'small'}/>
    },
	'default': Text
}


export function registerDataType (name, dataType) {
	dmsDataTypes[name] = dataType
}

export function getViewComp (attr) {
	const { type='default', isArray=false, attributes } = attr
	let Comp = get(dmsDataTypes, `[${type}]`, dmsDataTypes['default'])
	// console.log('attr',attr)
	let output = Comp.ViewComp
	if( isArray ) {
		let ArrayComp = attr.DisplayComp ? attr.DisplayComp.ViewComp : Array.ViewComp
		output = (props) => <ArrayComp Component={Comp} {...props} attr={attr} />
	}
	return output
}

export function getEditComp (attr) {
	const { type='default', isArray=false, attributes } = attr
	// console.log('get EditComp attr:', attr)
	let Comp = get(dmsDataTypes, `[${type}]`, dmsDataTypes['default'])
	let output = Comp.EditComp
	if( isArray ) {
		let ArrayComp = attr.DisplayComp ? attr.DisplayComp.EditComp : Array.EditComp
		output = (props) => <ArrayComp Component={Comp} {...props} attr={attr} />
	}
	return output
}


export default dmsDataTypes