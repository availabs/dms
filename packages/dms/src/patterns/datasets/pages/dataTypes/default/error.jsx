import React, {useContext} from 'react'
import {Link, useNavigate} from "react-router";
import {DatasetsContext} from "../../../context";
import {ThemeContext} from "../../../../../ui/useTheme";
import {dataItemsNav} from "../../../../../utils/nav";
import StatePanel from "../../../components/StatePanel";
import {errorPageTheme} from "./errorPage.theme";

const MESSAGE = 'Unable to complete your request at the moment. Please try again later.';

// The datasets routes' errorElement. `baseUrl` comes from siteConfig (no DatasetsContext here).
function ErrorPage({baseUrl = ''}) {
    const {theme: fullTheme, UI} = useContext(ThemeContext);
    const {parent} = useContext(DatasetsContext) || {};
    const navigate = useNavigate();
    const {Layout, Icon} = UI;
    const t = {...errorPageTheme, ...(fullTheme?.datasets?.errorPage || {})};
    const sectionTheme = fullTheme?.sectionGroup?.['default'] || {};
    // Shared secondary nav — mount-aware base (navPrefix; see DatasetsList).
    const menuItemsSecondNav = React.useMemo(
        () => dataItemsNav(fullTheme?.navOptions?.secondaryNav?.navItems || [], parent?.navPrefix || '', false),
        [fullTheme?.navOptions?.secondaryNav?.navItems, parent?.navPrefix]
    );

    return (
        <div className={`${fullTheme?.page?.container}`}>
            <Layout
                navItems={[]}
                secondNav={menuItemsSecondNav}
                // v6 keeps the site nav so the reader can go somewhere else; pre-v6 hid it
                pageTheme={t.keepNav ? undefined : {navOptions: {sideNav: {size: 'none'}, topNav: {size: 'none'}}}}
            >
                {t.page ? (
                    <div className={t.page}>
                        <section className={t.card}>
                            <StatePanel icon="Alert" tone="brick" title={t.title} text={MESSAGE}>
                                <button type="button" className={t.actionBtn} onClick={() => navigate(0)}>
                                    {Icon ? <Icon icon="Refresh" className={t.actionIcon}/> : null}Try again
                                </button>
                                <Link to={baseUrl || '/'} className={t.actionBtn}>Back to data sources</Link>
                            </StatePanel>
                        </section>
                    </div>
                ) : (
                    <div className={`${sectionTheme?.wrapper1}`}>
                        <div className={t.legacyInner}>
                            <div className={sectionTheme?.wrapper3}>
                                <div className={t.legacyText}>{MESSAGE}</div>
                            </div>
                        </div>
                    </div>
                )}
            </Layout>
        </div>
    )
}


export default ErrorPage
