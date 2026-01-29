import React from 'react'

const TabPanel = (props) => {
    let {tabs,activeIndex=0,setActiveIndex=null, themeOptions} = props
    const theme = {};
    const [activeTabIndex, setActiveTabIndex] = React.useState(activeIndex)

    // ----------
    // when activeIndex is passed by props
    // update it on change
    // ----------
    React.useEffect(()=>{
        setActiveTabIndex(activeIndex)
    },[activeIndex])

    return(
        <div className={`${theme.tabpanelWrapper}`}>
            <div className={`${theme.tabWrapper}`}>
                { tabs.map(({ icon,name }, i) => (
                    <div
                        key={ i }
                        onClick={ e => setActiveIndex ? setActiveIndex(i) : setActiveTabIndex(i)  }
                        className={`${ i === activeTabIndex ? theme.tabActive : theme.tab}`}
                    >
                        <span className={ `${ icon } ${theme.icon}` }/>
                        <span className={`${theme.tabName}`}> {name} </span>
                    </div>

                ))
                }
            </div>
            <div className={`${theme.contentWrapper}`}>
                { tabs.map(({ Component }, i) => (
                    <div
                        key={ i }
                        style={ { display: i === activeTabIndex ? "block" : "none" } }>
                        <Component { ...props } />
                    </div>
                ))
                }
            </div>
        </div>
    )
}

export default TabPanel