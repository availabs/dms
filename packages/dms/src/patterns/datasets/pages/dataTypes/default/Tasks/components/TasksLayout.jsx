import { TasksBreadcrumb } from "./TasksBreadcrumb";
export const TasksLayout = ({ children, params }) => {
  return (
    <div className={'max-w-7xl mx-auto'}>
      <TasksBreadcrumb params={params}/>
      <div className="">{children}</div>
    </div>
  );
};
