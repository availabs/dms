export { dmsDataLoader, dmsDataEditor } from './api'
//export { default as DmsManager } from './dms-manager'
export { updateRegisteredFormats, updateAttributes } from './dms-manager/_utils'
export { dmsDataTypes, registerDataType } from './data-types'
export { default as dmsPageFactory } from './dmsPageFactory'
export { json2DmsForm } from './dms-manager/_utils'
export { default as dmsSiteFactory, DmsSite } from "./patterns/admin/dmsSiteFactory";
export { CMSContext } from './patterns/page/context'
export { default as adminConfig }  from './patterns/admin/siteConfig'
export { default as Selector, registerComponents } from "./patterns/page/components/selector"

// const output = {
// 	dmsDataLoader, 
// 	dmsDataEditor,
// 	DmsManager,
// 	updateRegisteredFormats, 
// 	updateAttributes,
// 	dmsDataTypes, 
// 	registerDataType,
// 	json2DmsForm,
// 	dmsPageFactory,
// 	dmsSiteFactory, 
// 	DmsSite,
// 	adminConfig,
// 	pageConfig,
// 	CMSContext,
// 	Selector,
// 	registerComponents
// }

// export default output