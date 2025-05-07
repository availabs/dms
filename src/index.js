import { dmsDataLoader, dmsDataEditor } from './api'
import { default as DmsManager } from './dms-manager'
import { updateRegisteredFormats, updateAttributes } from './dms-manager/_utils'
import { dmsDataTypes, registerDataType } from './data-types'
import { default as dmsPageFactory } from './dmsPageFactory'
import { json2DmsForm } from './dms-manager/_utils'
import { default as dmsSiteFactory, DmsSite } from "./patterns/admin/dmsSiteFactory";
import { default as pageConfig, CMSContext } from './patterns/page/siteConfig'
import { default as adminConfig }  from './patterns/admin/siteConfig'
import { default as Selector, registerComponents } from "./patterns/page/ui/dataComponents/selector"

const output = {
	dmsDataLoader, 
	dmsDataEditor,
	DmsManager,
	updateRegisteredFormats, 
	updateAttributes,
	dmsDataTypes, 
	registerDataType,
	json2DmsForm,
	dmsPageFactory,
	dmsSiteFactory, 
	DmsSite,
	adminConfig,
	pageConfig,
	CMSContext,
	Selector,
	registerComponents
}

export default output