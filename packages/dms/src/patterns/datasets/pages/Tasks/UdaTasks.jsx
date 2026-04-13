import React, {useContext} from "react";
import UdaTaskList from "./UdaTaskList";
import Breadcrumbs from "../../components/Breadcrumbs";
import {DatasetsContext} from "../../context";

const UdaTasks = (props) => {
  const {UI, baseUrl} = useContext(DatasetsContext);
  const {Layout, LayoutGroup} = UI;
  return (
    <Layout navItems={[]}>
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
