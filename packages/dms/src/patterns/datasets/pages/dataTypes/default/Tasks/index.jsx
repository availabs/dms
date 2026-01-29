import TaskList from "./TaskList";
import { TasksLayout } from "./components/TasksLayout";

const TasksComponent = (props) => {
  return (
    <TasksLayout params={props.params}>
      <TaskList {...props} pageSize={10}/>
    </TasksLayout>
  );
};
export default TasksComponent;
