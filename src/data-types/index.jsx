import React from 'react'
import text from './text'
import textarea from './textarea'
import boolean from './boolean'

import dmsFormat from './dms-format'
import Array from './array'
import Lexical from './lexical'

import get from 'lodash/get'
let i = 0

export const dmsDataTypes = {
	'text': text,
	'datetime': text,
	'textarea': textarea,
	'boolean': boolean,
	'dms-format': dmsFormat,
	'lexical': Lexical,
	'default': text
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