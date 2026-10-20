import React, {useContext} from "react";
import UdaTaskList from "./UdaTaskList";
import Breadcrumbs from "../../components/Breadcrumbs";
import {DatasetsContext} from "../../context";
import {ThemeContext} from "../../../../ui/useTheme";
import {dataItemsNav} from "../../../../utils/nav";
import {udaTaskListTheme} from "./UdaTaskList.theme";

const UdaTasks = (props) => {
  const {UI, baseUrl, parent} = useContext(DatasetsContext);
  const {theme} = useContext(ThemeContext) || {};
  const {Layout, LayoutGroup} = UI;
  const t = {...udaTaskListTheme, ...(theme?.datasets?.udaTaskList || {})};
  // Shared secondary nav — mount-aware base (pattern.navPrefix; '' on primary mounts) (see DatasetsList).
  const menuItemsSecondNav = React.useMemo(
    () => dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [], parent?.navPrefix || '', false),
    [theme?.navOptions?.secondaryNav?.navItems, parent?.navPrefix]
  );
  return (
    <Layout navItems={[]} secondNav={menuItemsSecondNav}>
      <Breadcrumbs items={[
        {icon: 'Database', href: baseUrl},
        {name: 'Tasks'},
      ]} />
      {/* v6 lays the page out directly; pre-v6 (t.page '') keeps the LayoutGroup */}
      {t.page ? (
        <div className={t.page}>
          {t.header ? (
            <div className={t.header}>
              <h1 className={t.title}>Tasks</h1>
              <span className={t.hint}>every loader, publish and download build across sources</span>
            </div>
          ) : null}
          <section className={t.card}>
            <UdaTaskList {...props} pageSize={10}/>
          </section>
        </div>
      ) : (
        <LayoutGroup>
          <UdaTaskList {...props} pageSize={10}/>
        </LayoutGroup>
      )}
    </Layout>
  );
};
export default UdaTasks;
