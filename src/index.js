import { dmsDataLoader, dmsDataEditor } from './api'
import DmsManager from './dms-manager'
import { dmsDataTypes, registerDataType } from './data-types'
import dmsPageFactory from './dmsPageFactory'
import { json2DmsForm } from './dms-manager/_utils'
import { CMSContext } from './patterns/page/siteConfig'
import dmsSiteFactory, {DmsSite} from "./patterns/admin/dmsSiteFactory";
import pageConfig from './patterns/page/siteConfig'
import adminConfig from './patterns/admin/siteConfig'
import Selector, { registerComponents } from "./patterns/page/components/selector"

export {
	DmsSite,
	DmsManager,
	dmsDataLoader,
	dmsDataEditor,
	dmsPageFactory,
	registerDataType,
	dmsDataTypes,
	json2DmsForm,
	CMSContext,
	dmsSiteFactory,
	pageConfig,
	adminConfig,
	Selector,
	registerComponents
}