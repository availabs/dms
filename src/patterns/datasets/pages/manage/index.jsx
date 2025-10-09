import React, {useEffect} from 'react'
import { DatasetsContext } from '../../siteConfig'






function FormsManager ({item, dataItems, attributes, logo, rightMenu}) {
 
  
  const { baseUrl, theme, user } = React.useContext(DatasetsContext) || {}

  return (
      <div className={`${theme?.page?.wrapper2}`}>
        {/*<SideNavContainer>
          Left Nav
        </SideNavContainer>
       */}   
        <div className={theme?.page?.wrapper3}>
          {/* Content */}
          <div>
            Forms Dashboard
          </div>
        </div>
       {/* <SideNavContainer>
          Right Nav
        </SideNavContainer>   */}
      </div>
  ) 
}


export default FormsManager

