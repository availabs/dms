import React from 'react'
import { CMSContext } from '../../context'
import {ThemeContext} from "../../../../ui/useTheme";


function FormsManager ({item, dataItems, attributes, logo, rightMenu}) {
    const { theme } = React.useContext(ThemeContext) || {};

  return (
      <div className={`${theme?.page?.wrapper2}`}>
        {/*<SideNavContainer>
          Left Nav
        </SideNavContainer>
       */}   
        <div className={theme?.page?.wrapper3}>
          {/* Content */}
          <div>
            Dashboard
          </div>
        </div>
       {/* <SideNavContainer>
          Right Nav
        </SideNavContainer>   */}
      </div>
  ) 
}


export default FormsManager

