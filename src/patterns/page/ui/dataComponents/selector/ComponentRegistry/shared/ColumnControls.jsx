import RenderColumnControls from "./RenderColumnControls";
import RenderActionControls from "./RenderActionControls";
import RenderMoreControls from "./RenderMoreControls";
import RenderAppearanceControls from "./RenderAppearanceControls";

// renders controls based on props passed. if any setters are not passed for a controller, it's not rendered.
export const ColumnControls = ({context}) => (
    <div className={'flex items-center'}>
        <RenderColumnControls context={context}/>
        <RenderActionControls context={context}/>
        <RenderMoreControls context={context}/>
        <RenderAppearanceControls context={context}/>
    </div>
)