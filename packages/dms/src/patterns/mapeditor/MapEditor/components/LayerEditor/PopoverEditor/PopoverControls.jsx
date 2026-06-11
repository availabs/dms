import React, { useContext , useMemo, useEffect }from 'react'
import { SymbologyContext } from "../../../";
import { MapEditorContext } from "../../../../context"
import { ThemeContext } from "../../../../../../ui/themeContext"
import useMapTheme from "../../../../../../ui/components/map/useMapTheme"
import { getComponentTheme } from "../../../../../../ui/useTheme"

import { Close, MenuDots } from '../../icons'

import {AddColumnSelectControl} from "../Controls"
import { get, set } from 'lodash-es'
import { isNumericColumnType } from '../../../../utils'
import { getJoinOutputKey, getJoinOutputLabel } from "../LinkedDataControl/constants"

const HOVER_FORMAT_OPTIONS = [
  { label: 'No Format Applied', value: ' ' },
  { label: 'Comma Separated', value: 'comma' },
  { label: 'Comma Separated ($)', value: 'comma_dollar' },
  { label: 'Percent (append %)', value: 'percent' },
  { label: 'Abbreviated', value: 'abbreviate' },
  { label: 'Abbreviated ($)', value: 'abbreviate_dollar' },
  { label: 'Date', value: 'date' },
  { label: 'Time (HH:MM am/pm)', value: 'time' },
  { label: 'Date + Time', value: 'datetime' },
  { label: 'Title', value: 'title' },
  { label: '0 = N/A', value: 'zero_to_na' },
];

const JUSTIFY_OPTIONS = [
  { label: 'Left (default)', value: '' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
];

const HEADER_CASE_OPTIONS = [
  { label: 'As authored', value: '' },
  { label: 'Capitalize', value: 'capitalize' },
  { label: 'UPPERCASE', value: 'uppercase' },
  { label: 'lowercase', value: 'lowercase' },
];

const buildFontStyleOptions = (theme) => {
  const ts = getComponentTheme(theme || {}, 'textSettings') || {};
  const keys = Object.keys(ts).filter((k) => k !== 'name' && k !== 'options');
  return [
    { label: 'Default', value: '' },
    ...keys.map((k) => ({ label: k, value: k })),
  ];
};

const buildHoverColumnMenuItems = ({ field, fontStyleOptions, updateField }) => {
  const controlDefs = [
    { type: 'input', label: 'Show Column Name', key: 'customName', inputType: 'text' },
    { type: 'select', label: 'Justify', key: 'justify', options: JUSTIFY_OPTIONS },
    { type: 'select', label: 'Header Justify', key: 'headerJustify', options: JUSTIFY_OPTIONS },
    { type: 'select', label: 'Format', key: 'formatFn', options: HOVER_FORMAT_OPTIONS },
    { type: 'select', label: 'Header', key: 'headerFontStyle', options: fontStyleOptions },
    { type: 'select', label: 'Header Case', key: 'headerCase', options: HEADER_CASE_OPTIONS },
    { type: 'select', label: 'Value', key: 'valueFontStyle', options: fontStyleOptions },
    { type: 'input', label: 'Padding', key: 'cellPadding', inputType: 'number' },
    { type: 'input', label: 'Padding Top', key: 'cellPaddingTop', inputType: 'number' },
    { type: 'input', label: 'Padding Right', key: 'cellPaddingRight', inputType: 'number' },
    { type: 'input', label: 'Padding Below', key: 'cellPaddingBottom', inputType: 'number' },
    { type: 'input', label: 'Padding Left', key: 'cellPaddingLeft', inputType: 'number' },
    { type: 'input', label: 'Col Span', key: 'cellSpan', inputType: 'number' },
    { type: 'input', label: 'Row Span', key: 'cellRowSpan', inputType: 'number' },
  ];

  return controlDefs.map(({ type, label, key, options, inputType }) => {
    if (type === 'select') {
      return {
        name: label,
        value: options.find((option) => option.value === field[key])?.label || '',
        showValue: true,
        items: options.map((option) => ({
          icon: option.value === field[key] ? 'CircleCheck' : 'Blank',
          name: option.label,
          onClickGoBack: true,
          onClick: () => updateField(key, option.value),
        })),
      };
    }

    return {
      name: label,
      value: field[key],
      showValue: true,
      items: [{
        name: `${label} input`,
        type: 'input',
        inputType,
        value: field[key] ?? '',
        onChange: (e) => updateField(key, e?.target?.value ?? e),
      }],
    };
  });
};

const normalizeHoverColumn = (column) => {
  if (typeof column === "string") {
    return {
      column_name: column,
      display_name: column,
      customName: "",
      formatFn: " ",
      justify: "right",
      headerJustify: "",
      headerCase: "",
      headerFontStyle: "",
      valueFontStyle: "",
      cellPadding: "",
      cellPaddingTop: "",
      cellPaddingRight: "",
      cellPaddingBottom: "",
      cellPaddingLeft: "",
      cellSpan: "",
      cellRowSpan: "",
      cellWidth: "",
    };
  }

  return {
    ...column,
    column_name: column?.column_name || column?.name || "",
    display_name: column?.display_name || column?.column_name || column?.name || "",
    customName: column?.customName || "",
    formatFn: column?.formatFn || " ",
    justify: column?.justify || "right",
    headerJustify: column?.headerJustify || "",
    headerCase: column?.headerCase || "",
    headerFontStyle: column?.headerFontStyle || "",
    valueFontStyle: column?.valueFontStyle || "",
    cellPadding: column?.cellPadding ?? "",
    cellPaddingTop: column?.cellPaddingTop ?? "",
    cellPaddingRight: column?.cellPaddingRight ?? "",
    cellPaddingBottom: column?.cellPaddingBottom ?? "",
    cellPaddingLeft: column?.cellPaddingLeft ?? "",
    cellSpan: column?.cellSpan ?? "",
    cellRowSpan: column?.cellRowSpan ?? "",
    cellWidth: column?.cellWidth ?? "",
  };
};
function onlyUnique(value, index, array) {
  return array.indexOf(value) === index;
}
const getDiffColumns = (baseArray, subArray) => {
  return baseArray.filter(baseItem => !subArray.includes(baseItem))
}

const getJoinedColumnOptions = (state, activeLayerId) => {
  const joinConfig =
    get(state, `symbology.layers[${activeLayerId}].join`) ??
    get(state, `symbology.layers[${activeLayerId}]['linked-data']`, {});
  const tileColumns = Array.isArray(joinConfig?.tileColumns) ? joinConfig.tileColumns : [];
  const columnConfigs = Array.isArray(joinConfig?.query?.columnConfigs) ? joinConfig.query.columnConfigs : [];
  const displayNameByKey = columnConfigs.reduce((acc, columnConfig) => {
    const key = getJoinOutputKey(columnConfig);
    if (key) acc[key] = getJoinOutputLabel(columnConfig);
    return acc;
  }, {});

  return tileColumns
    .filter(Boolean)
    .map((columnName) => ({
      name: columnName,
      display_name: displayNameByKey[columnName] || columnName,
      type: "number",
      _joined: true,
    }));
};

export function ColumnSelectControl({path, params={}}) {
  const { state, setState } = React.useContext(SymbologyContext);
  const { UI } = useContext(ThemeContext) || {};
  const { DndList, Button } = UI;
  const activeLayerId = state.symbology.activeLayer;

  const pathBase =
    params?.version === "interactive"
      ? `symbology.layers[${activeLayerId}]${params.pathPrefix}`
      : `symbology.layers[${activeLayerId}]`;

  const { selectedColumns, layerType } = useMemo(() => {
    return {
      selectedColumns: get(state, `${pathBase}.${path}`),
      layerType: get(state, `${pathBase}['layer-type']`),
    };
  }, [state, path, params]);

  const viewId = get(state,`symbology.layers[${activeLayerId}].view_id`)
  const sourceId = get(state,`symbology.layers[${activeLayerId}].source_id`);
  const { pgEnv, useFalcor } = useContext(MapEditorContext);
  const { falcor, falcorCache } = useFalcor();

  useEffect(() => {
    if (sourceId) {
      falcor.get([
          "uda", pgEnv, "sources", "byId", sourceId, "metadata"
      ]);
    }
  }, [sourceId]);

  const attributes = useMemo(() => {
    let columns = get(falcorCache, [
      "uda", pgEnv, "sources", "byId", sourceId, "metadata", "value", "columns"
    ], []);
    if (columns.length === 0) {
      columns = get(falcorCache, [
        "uda", pgEnv, "sources", "byId", sourceId, "metadata", "value"
      ], []);
    }
// console.log("falcorCache:", falcorCache);

// console.log("COLUMNS:", columns);

    if(params.onlyTypedAttributes) {
      columns = columns.filter(d => {
        if(layerType === 'choropleth' && !isNumericColumnType(d.type)){
          return false
        }
        return true
      })
    }
    const joinedColumns = getJoinedColumnOptions(state, activeLayerId);
    const existingNames = new Set((columns || []).map((column) => column?.name));
    const mergedColumns = [...columns, ...joinedColumns.filter((column) => !existingNames.has(column.name))];

    return Array.isArray(mergedColumns) ? mergedColumns : [];
  }, [sourceId, falcorCache, state, activeLayerId, layerType, params.onlyTypedAttributes]);

// console.log("ColumnSelectControl::attributes", attributes)

  const attributeNames = useMemo(
    () => {
      // console.log('what are attributes', attributes)
      return (attributes || []).map((attr) => attr.name)
    },[attributes]);

  useEffect(() => {
    if(selectedColumns === undefined) {
      if(!params.default){
        setState((draft) => {
          set(
            draft,
            `${pathBase}.${path}`,
            attributes
              .filter((d) => !["wkb_geometry"].includes(d.name))
              .map((attr) => ({
                column_name: attr.name,
                display_name: attr?.display_name || attr.name,
              }))
          );
        });
      } else {
        setState((draft) => {
          set(
            draft,
            `${pathBase}.${path}`,
            attributes
              .filter(attr => attr.name === params.default)
              .map((attr) => ({
                column_name: attr.name,
                display_name: attr?.display_name || attr.name,
              }))
          );
        });
      }
    }
  }, [attributes]);

  useEffect(() => {
    if (!Array.isArray(selectedColumns) || !selectedColumns.length) return;

    const normalizedColumns = selectedColumns.map(normalizeHoverColumn);
    const isAlreadyNormalized = selectedColumns.every((column, index) => {
      const normalized = normalizedColumns[index];
      return JSON.stringify(column) === JSON.stringify(normalized);
    });

    if (!isAlreadyNormalized) {
      setState((draft) => {
        set(draft, `${pathBase}.${path}`, normalizedColumns);
      });
    }
  }, [selectedColumns, pathBase, path, setState]);

  const selectedColumnNames = useMemo(() => {
    return selectedColumns ? selectedColumns.map((column) => normalizeHoverColumn(column).column_name) : undefined;
  }, [selectedColumns]);
  const availableColumnNames = useMemo(() => {
    return (
      selectedColumnNames
        ? getDiffColumns(attributeNames, selectedColumnNames)
        : attributeNames
    ).filter((d) => !["wkb_geometry"].includes(d));
  }, [selectedColumnNames, attributeNames]);

  React.useEffect(() => {
    falcor.get([
      "uda",
      pgEnv,
      "viewsById",
      viewId,
      "dataByIndex",
      {"from":0, "to": 100},
      selectedColumnNames
    ])
  }, [falcor, pgEnv, viewId, selectedColumnNames]);

  const sampleData = useMemo(() => {
    return Object.values(
      get(falcorCache, ["uda", pgEnv, "viewsById", viewId, "dataByIndex"], [])
    ).map((v) =>  {
      // console.log('what', v)

      return v?.value ? get(falcorCache, v.value, "") : ""
    });
  }, [pgEnv, falcorCache]);

  return (
    <div className='flex w-full flex-wrap'>
      <div className='flex w-full flex-wrap my-2'>
        <AddColumnSelectControl
          setState={(newColumn) => {
            setState((draft) => {
              if (newColumn !== "") {
                const newAttr = attributes.find(attr => attr.name === newColumn);
                set(
                  draft,
                  `${pathBase}.${path}`,
                  selectedColumns
                    ? [...selectedColumns.map(normalizeHoverColumn), normalizeHoverColumn({ column_name: newColumn, display_name: newAttr?.display_name || newColumn })]
                    : [normalizeHoverColumn({ column_name: newColumn, display_name: newAttr?.display_name || newColumn })]
                );
              }
            });
          }}
          availableColumnNames = {
            availableColumnNames.map(colName => {
              const newAttr = attributes.find(attr => attr.name === colName);
              return { value: colName, label: newAttr?.display_name || colName, _joined: newAttr?._joined };
            })
          }
        />
      </div>
      <div className='flex w-full flex-wrap my-2 mx-4 justify-around'>
        <Button
          themeOptions={{ size: "xs", color: 'primary' }}
          className={availableColumnNames?.length === 0 ? "disabled:opacity-75 pointer-events-none	" : " "}
          disabled={availableColumnNames?.length === 0}
          onClick={() => {
            setState(draft => {
              set(
                draft,
                `${pathBase}.${path}`,
                attributes
                  .filter((d) => !["wkb_geometry"].includes(d.name))
                  .map((attr) => normalizeHoverColumn({
                    column_name: attr.name,
                    display_name: attr?.display_name || attr.name,
                  }))
              );
            })

          }}
        >
          Add All Columns
        </Button>
        <Button
          themeOptions={{ size: "xs", color: 'danger' }}
          className={selectedColumnNames?.length === 0 ? "disabled:opacity-75 pointer-events-none	bgDanger" : " bgDanger"}
          disabled={selectedColumnNames?.length === 0}
          onClick={() => {
            setState(draft => {
              set(
                draft,
                `${pathBase}.${path}`,
                []
              );
            })

          }}
        >
          Remove All Columns
        </Button>
      </div>
      <ExistingColumnList
        selectedColumns={selectedColumns}
        sampleData={sampleData}
        reorderAttrs={(start, end) => {
          const sections = selectedColumns.map(normalizeHoverColumn);
          const [item] = sections.splice(start, 1);
          sections.splice(end, 0, item);

          setState((draft) => {
            set(
              draft,
              `${pathBase}.${path}`,
              sections
            );
          });
        }}
        renameAttr={({columnName, displayName}) => {
          const newColumns = selectedColumns.map(normalizeHoverColumn);
          const columnIndex = newColumns.findIndex(colObj => colObj.column_name === columnName);
          const [item] = newColumns.splice(columnIndex, 1);
          const newItem = {...item};
          newItem.display_name = displayName;
          newColumns.splice(columnIndex, 0, newItem);
          setState((draft) => {
            set(
              draft,
              `${pathBase}.${path}`,
              newColumns
            );
          })
        }}
        removeAttr={(columnName) => {
          //console.log('column_name', columnName, selectedColumns.filter((colObj) => colObj.column_name !== columnName))
          setState((draft) => {
            set(
              draft,
              `${pathBase}.${path}`,
              selectedColumns
                .map(normalizeHoverColumn)
                .filter((colObj) => colObj.column_name !== columnName)
            );
          })
        }}
        setFieldConfig={({ columnName, ...fieldUpdates }) => {
          const newColumns = selectedColumns.map(normalizeHoverColumn);
          const columnIndex = newColumns.findIndex((colObj) => colObj.column_name === columnName);
          if (columnIndex < 0) return;
          newColumns[columnIndex] = {
            ...newColumns[columnIndex],
            ...fieldUpdates,
          };
          setState((draft) => {
            set(
              draft,
              `${pathBase}.${path}`,
              newColumns
            );
          });
        }}
      />
    </div>
  );
}

const ExistingColumnList = ({selectedColumns, sampleData, path, reorderAttrs, removeAttr, renameAttr, setFieldConfig}) => {

// console.log("ExistingColumnList::selectedColumns", selectedColumns)

  const { UI, theme } = useContext(ThemeContext) || {};
  const { DndList, NavigableMenu, Button } = UI;
  const mapTheme = useMapTheme();
  const fontStyleOptions = useMemo(() => buildFontStyleOptions(theme), [theme]);
  return (
    <DndList
      onDrop={reorderAttrs}
    >
      {selectedColumns?.map((rawSelectedCol, i) => {
        const selectedCol = normalizeHoverColumn(rawSelectedCol);
        const updateField = (key, value) => setFieldConfig({ columnName: selectedCol.column_name, [key]: value });
        const menuConfig = buildHoverColumnMenuItems({ field: selectedCol, fontStyleOptions, updateField });
        const sampleText = sampleData
          .map((row) => row[selectedCol.column_name])
          .filter(item => item !== 'null')
          .filter(onlyUnique)
          .slice(0,2)
          .join(", ");
        const hasSampleText = Boolean(sampleText);
        return (
          <div
            key={i}
            className={`group/title grid w-full cursor-grab text-sm ${mapTheme.legend.row} ${mapTheme.legend.rowHover}`}
            style={{
              gridTemplateColumns: hasSampleText
                ? 'minmax(0, 1fr) minmax(72px, 96px) 40px 40px'
                : 'minmax(0, 1fr) 40px 40px',
            }}
          >
            <div className="min-w-0 truncate border-t border-r border-slate-200 px-2 py-1">
              <input
                  type="text"
                  className='w-full px-2 border text-sm border-transparent hover:border-slate-200 outline-2 outline-transparent rounded-md bg-transparent text-slate-700 placeholder:text-gray-400 focus:outline-pink-300 sm:leading-6'
                  value={selectedCol.display_name}
                  onChange={(e) => {
                    renameAttr({columnName:selectedCol.column_name , displayName:e.target.value})
                  }}
                />
            </div>
            {hasSampleText ? (
              <div className={`min-w-0 flex items-center truncate border-t border-slate-200 px-2 py-1 text-[13px] ${mapTheme.legend.secondaryLabel}`}>
                {sampleText}
              </div>
            ) : null}
            <div className="border-t border-slate-200 flex items-center justify-center px-1">
              <NavigableMenu
                title={selectedCol.display_name}
                config={menuConfig}
              >
                <Button type="plain" className="flex h-8 w-8 items-center justify-center p-0">
                  <MenuDots className={`fill-slate-400 hover:fill-slate-600 ${mapTheme.legend.controlButton}`} />
                </Button>
              </NavigableMenu>
            </div>
            <div
              className="group/icon flex cursor-pointer items-center justify-center rounded border-t border-slate-200 px-1 py-0.5 hover:bg-slate-100"
              onClick={() => {
                removeAttr(selectedCol.column_name)
              }}
            >
              <Close
                className="mx-[6px] cursor-pointer fill-slate-400 group-hover/icon:fill-slate-500"
              />
            </div>
          </div>
        );
      })}
    </DndList>
  );
};
