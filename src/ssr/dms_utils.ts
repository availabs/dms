import pageConfig from '../patterns/page/siteConfig.jsx'
import adminConfig from '../patterns/admin/siteConfig.jsx'
import formsConfig from '../patterns/forms/siteConfig.jsx'
import { dmsDataLoader } from '../api/index.js'
import { matchRoutes } from 'react-router';
//import DMSconfig from "../dmsconfig.json"
//const { falcor } = await import('../server/falcor.ts')
// ----------------------------------------------------
// -------------- Get DMS Config ----------------------
// ----------------------------------------------------
const adminSettings = {
    app: import.meta.env.VITE_DMS_APP || 'mitigat-ny-prod',
    type: import.meta.env.VITE_DMS_TYPE || 'test',
    base_url: "list",
    pattern_type: 'admin',
    subdomain: '*'

}
export const adminSite = adminConfig?.[0](adminSettings)

const patternTypes = {
    page: pageConfig,//await import('../modules/dms/src/patterns/page/siteConfig.jsx'),
    forms: formsConfig,
    admin: adminConfig,

}

const getSubdomain = (host) => {
    //console.log('dms_utils - getSubdomain - host', host)
    // ---
    // takes window.location.host and returns subdomain
    // only works with single depth subdomains 
    // ---
    //console.log('host', host,  host.split('.'));
    if (process.env.NODE_ENV === "development") {
        return host && host.split('.').length >= 2 ?
            host.split('.')[0].toLowerCase() :
                false
    } else {
        return host.split('.').length > 2 ?
            host.split('.')[0].toLowerCase() :
                false
    }
}


// ----------------------------------------------------
// -------------- Config Setup-------------------------
// ----------------------------------------------------


let {
  API_HOST = 'https://graph.availabs.org',
  baseUrl = ""
} = {}






const getDmsConfig = (host, path, patterns=[] ) => {
    
    const subdomain = getSubdomain(host)
    const matches = matchRoutes(
        [adminSettings, ...patterns]
          // -- filter for subdomain
          .filter(d => 
            d.subdomain === subdomain || 
            (!d.subdomain && !subdomain) || 
            d.subdomain === '*'
          )
          // -- map to matchRoutes format
          .map(d => ({path:`${d.base_url?.replace(/^\/|\/$/g, '')}/*`, ...d})), 
          // -- matchRoutes options
          {pathname: path}
    )   
    const patternConfig = matches?.[0]?.route
    const config = patternConfig?.pattern_type ? 
        patternTypes[patternConfig.pattern_type][0]({
            app: patternConfig.app,
            type: patternConfig?.doc_type || patternConfig.type,
            pattern: patternConfig,
            siteType: adminSettings.type,
            baseUrl: `/${patternConfig.base_url?.replace(/^\/|\/$/g, '')}`,
            pgEnv:'hazmit_dama'
        }) :
        null
    //console.log('dms_utils - getDmsConfig', getSubdomain(host), path, patterns.length)
    return config
}


export default getDmsConfig

const updateRegisteredFormats = (registerFormats, app) => {
  if(Array.isArray(registerFormats)){
    registerFormats = registerFormats.map(rFormat => {
      rFormat.app = app;
      rFormat.registerFormats = updateRegisteredFormats(rFormat.registerFormats, app);
      rFormat.attributes = updateAttributes(rFormat.attributes, app);
      return rFormat;
    })
  }
  return registerFormats;
}

const updateAttributes = (attributes, app) => {
  if(Array.isArray(attributes)){
    attributes = attributes.map(attr => {
      attr.format = attr.format ? `${app}+${attr.format.split('+')[1]}`: undefined;
      return updateRegisteredFormats(attr, app);
    })
    //console.log('attr', attributes)
  }
  return attributes;
}