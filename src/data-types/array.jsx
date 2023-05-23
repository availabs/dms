import React from "react"

const Edit = ({Component, value, onChange, attr}) => {
    if (!value || !value.map) { 
        value = []
    }
    const [newValue, setNewValue] = React.useState('')

    const addNewValue = () => {
        onChange([...value, newValue])
        setNewValue('')
    } 
    return (
        <>
            {value.map((v,i) => 
                <Component.ViewComp value={v} {...attr} key={i} />
            )}
            <Component.EditComp value={newValue} onChange={setNewValue} {...attr} />
            <button onClick={addNewValue}>Add</button>
            
        </>
    )
}

const View = ({Component, value, attr}) => {
    if (!value || !value.map) { return '' }
    return value.map((v,i) => <Component.ViewComp {...attr } key={i} value={v}/>)
}

export default {
    "EditComp": Edit,
    "ViewComp": View
}