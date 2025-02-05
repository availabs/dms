import RenderColumnControls from "./RenderColumnControls";
import RenderFilterControls from "./RenderFilterControls";
import RenderGroupControls from "./RenderGroupControls";
import RenderActionControls from "./RenderActionControls";
import RenderMoreControls from "./RenderMoreControls";

// renders controls based on props passed. if any setters are not passed for a controller, it's not rendered.
export const ColumnControls = ({context}) => (
    <div className={'flex items-center'}>
        <RenderColumnControls context={context}/>
        <RenderActionControls context={context}/>
        <RenderMoreControls context={context}/>
    </div>
)