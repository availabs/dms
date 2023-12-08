
import { dmsPageFactory, registerDataType } from "~/modules/dms/src"
import { withAuth } from "~/modules/ams/src" 

import siteConfig from './siteConfig'

import Selector from "./dms/selector"
registerDataType("selector", Selector)

export default { 
  ...dmsPageFactory(siteConfig, "/",  withAuth),
  name: "CMS",
  sideNav: {
    size: "none"
  },
  topNav: {
    size: "none"
  }
}