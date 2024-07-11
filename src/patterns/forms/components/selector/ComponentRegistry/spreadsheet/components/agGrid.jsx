import {AgGridReact} from "./ag-grid-react/src/agGridReact";
import { ClientSideRowModelModule } from './ag-grid/community-modules/client-side-row-model/src/main';
import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-quartz.css';
import 'ag-grid-enterprise';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import DataTypes from "../../../../../../../data-types";

const RenderEditor = ({ value, onValueChange, eventKey, rowIndex, column, data, attribute, updateItem, ...rest }, ref) => {
    const refInput = useRef(null);
    const updateValue = (val) => {
        onValueChange(val === "" ? null : val);
        val !== value && updateItem(val === "" ? null : val, {name: column.colId}, {...data, [column.colId]: val === "" ? null : val})
    };
    console.log('props', data, column, rest)
    useEffect(() => {
        let startValue;

        if (eventKey === "Backspace") {
            startValue = "";
        } else if (eventKey && eventKey.length === 1) {
            startValue = eventKey;
        } else {
            startValue = value;
        }
        if (startValue == null) {
            startValue = "";
        }

        updateValue(startValue);

        // refInput.current.focus();
    }, []);

    const Comp = DataTypes[attribute?.type || 'text']?.EditComp

    return (
        // change this with EditComp
        <Comp
            {...attribute}
            value={value || ""}
            ref={refInput}
            onChange={(value) => {
                updateValue(value)
            }}
            className="my-simple-editor"
        />
    );
}
const App = ({attributes, visibleAttributes, data, updateItem}) => {
    console.log('data', data)
    const gridRef = useRef(null);
    const [rowData, setRowData] = useState(data);
    const [colDefs, setColDefs] = useState(
        visibleAttributes.map(attr => ({
            field: attr,
            type: 'dropdown',
            editable: true,
            cellEditorPopup: attr === 'associated_hazards',
            filterable: false,
            cellEditor: (props, ref) => <RenderEditor {...props} ref={ref} updateItem={updateItem} attribute={attributes.find(a => a.name === attr)}/>,
        })));
    console.log('????????', colDefs)
    const onGridReady = (params) => {
        setTimeout(() => setRowData([...rowData]), 2000);
    };

    const getRowId = useCallback((params) => {
        return String(params.data.id)
    }, []);

    useEffect(() => {
        setRowData(data)
    }, [data]);

    return (
        <div style={{ display: 'flex w-full h-full' }}>
            <div className="ag-theme-quartz" style={{ height: 500, width: 800, margin: 10 }}
            >
                <AgGridReact
                    ref={gridRef}
                    getRowId={getRowId}
                    defaultColDef={{
                        filter: true,
                        flex: 1,
                    }}
                    rowSelection="multiple"
                    onGridReady={onGridReady}
                    rowData={rowData}
                    columnDefs={colDefs}
                    modules={[ClientSideRowModelModule]}
                />
            </div>
        </div>
    );
};
export default App
// const root = createRoot(document.getElementById('root'));
// root.render(<App />);
