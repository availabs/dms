import React from 'react';

const DefaultComp = ({title, subtitle}) => (
	<div>
		<div>{title}</div>
		<div>{subtitle}</div>
	</div>
)
export const TabPanel = ({theme = {}, tabs = [], activeIndex= 0, setActiveIndex = null}) => {
	if(!tabs) return null;
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
	            { tabs.map(({ icon, title, subtitle }, i) => (
                  	<div
	                  	key={ i }
	                  	onClick={ e => setActiveIndex ? setActiveIndex(i) : setActiveTabIndex(i)  }
	                  	className={`${ i === activeTabIndex ? theme.tabActive : theme.tab}`}
	                >
	                    <span className={ `${ icon } ${theme.icon}` }/>
	                    <span className={`${theme.tabTitle}`}> {title} </span>
	                    <span className={`${theme.tabSubtitle}`}> {subtitle} </span>
                    </div>

	                ))
	            }
          	</div>
		</div>
	)
}