import React, {useContext} from 'react'
import {cloneDeep, merge} from "lodash-es"
import {DatasetsContext} from "../../../context";
import {ThemeContext} from "../../../../../ui/useTheme";

function ErrorPage({}) {
    const {theme: fullTheme} = useContext(ThemeContext);
    const {UI} = React.useContext(DatasetsContext) || {};
    const {Layout} = UI;
    let theme = merge(cloneDeep(fullTheme), {})
    const sectionTheme = theme?.sectionGroup?.['default'] || {};

    return (
        <div className={`${theme?.page?.container}`}>
            <Layout
                navItems={[]}
                pageTheme={{navOptions: {sideNav: {size: 'none'}, topNav: {size: 'none'}}}}
                // Menu={Menu} needs user
            >
                <div className={`${sectionTheme?.wrapper1}`}>
                    <div
                        className={`hidden scrollbar-sm lg:block sticky top-[120px] h-[calc(100vh)] bg-white rounded-lg shadow-md w-full overflow-y-auto overflow-x-hidden`}>
                        <div className={sectionTheme?.wrapper3}>
                            <div className={'mx-auto max-w-fit pt-[120px] text-lg'}>
                                Unable to complete your request at the moment. Please try again later.
                            </div>
                        </div>
                    </div>
                </div>
            </Layout>
        </div>
    )
}


export default ErrorPage

