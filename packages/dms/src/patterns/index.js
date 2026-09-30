import pageConfig from './page/siteConfig'
//import formsConfig from './forms/siteConfig'
import adminConfig from './admin/siteConfig'
import authConfig from './auth/siteConfig'
import datasetsConfig from './datasets/siteConfig'
import mapeditorConfig from './mapeditor/siteConfig'
import qaConfig from './qa/siteConfig'

const patterns = {
  page: pageConfig,
  //forms: formsConfig,
  admin: adminConfig,
  auth: authConfig,
  datasets: datasetsConfig,
  mapeditor: mapeditorConfig,
  qa: qaConfig
}

export async function resolvePatterns() {
  return patterns
}

export default patterns
