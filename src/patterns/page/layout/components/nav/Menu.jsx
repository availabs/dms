import React from "react"

import { Link } from "react-router-dom"

import { useClickOutside } from "../utils"
import { useTheme } from "../../wrappers/with-theme"

export const NavMenu = ({ control, children, customTheme }) => {
    const [open, setOpen] = React.useState(false),
        clickedOutside = React.useCallback(() => setOpen(false), []),
        [setRef] = useClickOutside(clickedOutside),
        theme = {...useTheme(), ...customTheme};
    return (
        <div ref={ setRef }
             className={`${theme.navMenu} ${open ? theme.navMenuOpen : ''}`}
             onMouseEnter={ e => setOpen(true) }
             onMouseLeave={ e => setOpen(false) }
             onClick={ e => {
                 e.preventDefault();
                 setOpen(!open)
             } }
        >
            {open ?
                <div className={ `${theme.navMenuBg} fixed p-3 -mt-5 ${open ? `block` : `hidden`} z-10` }>
                    { children }
                </div>
                :
                <div className={ `text-right h-full ${open ? 'hidden' : 'block'}` }>
                    { control }
                </div>
            }
        </div>
    )
}

export const NavMenuItem = ({ to = "#", children }) => {
  const theme = useTheme();
  return (
    <Link to={ to }>
      <div className={ `${ theme.transition } ${theme.navMenuItem}` }>
        { children }
      </div>
    </Link>
  )
}

export const NavMenuSeparator = ({className}) =>
    <div className={`border-b-2 my-1 text-gray-400 ${className}`}/>