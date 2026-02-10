import React, {useContext} from "react";
import TaskList from "./TaskList";
import Breadcrumbs from "../../../../components/Breadcrumbs";
import {DatasetsContext} from "../../../../context";

const TasksComponent = (props) => {
  const {UI, baseUrl} = useContext(DatasetsContext);
  const {Layout, LayoutGroup} = UI;
  return (
    <Layout navItems={[]}>
      <Breadcrumbs items={[
        {icon: 'Database', href: baseUrl},
        {name: 'Tasks'},
      ]} />
      <LayoutGroup>
        <TaskList {...props} pageSize={10}/>
      </LayoutGroup>
    </Layout>
  );
};
export default TasksComponent;
