import { getViewComp, getEditComp } from '../data-types'
import get from 'lodash/get'
import cloneDeep from 'lodash/cloneDeep'

export function getAttributes (format, options={}, mode='') {
	//console.log('getAttributes', format, options)
	
	const formats = processFormat(format)
	const accessor = options?.accessor || 'key'
	// const attributeFilter = get(options, 'attributes', [])
	// console.log('getAttributes', format.attributes)
	const attributes = format.attributes
		//.filter(attr => attributeFilter.length === 0 || attributeFilter.includes(attr.key))
		.filter(attr => mode !== 'edit' || 
				(typeof attr.editable === 'undefined' ||
				!attr.editable === false)
		)
		.reduce((out,attr) => {
			if(attr.format && formats[attr.format]) {
				out[attr[accessor]] = {
					...attr,
					attributes: getAttributes(formats[attr.format])
				}
			} else {
				out[attr[accessor]] = attr
			}
			return out
		},{})

	const attributeKeys = Object.keys(attributes)

	//console.log('attributeKeys', attributes)
		
	Object.keys(attributes)
		.filter(attributeKey => attributeKeys.includes(attributeKey))
		.forEach(attributeKey => {		
			attributes[attributeKey].ViewComp = getViewComp(
				get(attributes, `${attributeKey}`, {})
			)
			attributes[attributeKey].EditComp = getEditComp(
				get(attributes, `${attributeKey}`, {})
			)
		})

	return attributes
}

export function processFormat (format, formats = {}) {
  if (!format) return formats;

  const Format = cloneDeep(format);

  if (Format.registerFormats) {
    Format.registerFormats.forEach(f => processFormat(f, formats));
  }

  formats[`${ Format.app }+${ Format.type }`] = Format;

  return formats;
}