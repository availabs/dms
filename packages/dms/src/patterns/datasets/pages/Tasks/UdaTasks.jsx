import React, {useContext} from "react";
import UdaTaskList from "./UdaTaskList";
import Breadcrumbs from "../../components/Breadcrumbs";
import {DatasetsContext} from "../../context";
import {ThemeContext} from "../../../../ui/useTheme";
import {dataItemsNav} from "../../../../utils/nav";

const UdaTasks = (props) => {
  const {UI, baseUrl, parent} = useContext(DatasetsContext);
  const {theme} = useContext(ThemeContext) || {};
  const {Layout, LayoutGroup} = UI;
  // Shared secondary nav — mount-aware base (pattern.navPrefix; '' on primary mounts) (see DatasetsList).
  const menuItemsSecondNav = React.useMemo(
    () => dataItemsNav(theme?.navOptions?.secondaryNav?.navItems || [], parent?.navPrefix || '', false),
    [theme?.navOptions?.secondaryNav?.navItems, parent?.navPrefix]
  );
  return (
    <Layout navItems={[]} secondNav={menuItemsSecondNav}>
      <Breadcrumbs items={[
        {icon: 'Database', href: baseUrl},
        {name: 'Tasks (New)'},
      ]} />
      <LayoutGroup>
        <UdaTaskList {...props} pageSize={10}/>
      </LayoutGroup>
    </Layout>
  );
};
export default UdaTasks;
