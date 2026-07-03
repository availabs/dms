import React from 'react'
import { TreeNodeView } from './treeNode'
import { PublishStateView } from './publishState'
import { SectionsChipView } from './sectionsChip'
import { LastPublishedView } from './last_published'
import { ActivityActionBadgeView } from './activity_action_badge'
import { TextEdit, TextView } from './text'
import { TextareaEdit, TextareaView } from './textarea'
import { BooleanEdit, BooleanView } from './boolean'
import { DmsFormatEdit, DmsFormatView } from './dms-format'
import { LexicalEdit, LexicalView } from '../components/lexical'
import { MultiSelectEdit as MultiselectEdit, MultiSelectView as MultiselectView } from '../components/MultiSelect'
import { RadioEdit, RadioView } from './radio'
import { CheckboxEdit, CheckboxView } from './checkbox'
import { ImageEdit, ImageView } from './image'
import { StatusPillEdit, StatusPillView } from './statusPill'
import { DeltaEdit, DeltaView } from './delta'
import { TargetBarEdit, TargetBarView } from './targetBar'
import { DataBarEdit, DataBarView } from './dataBar'
import { DataColorCellEdit, DataColorCellView } from './dataColorCell'
import { VerdictDotEdit, VerdictDotView } from './verdictDot'
import { StatValueEdit, StatValueView } from './statValue'
import { CodeWithSubEdit, CodeWithSubView } from './codeWithSub'
import { DownloadButtonEdit, DownloadButtonView } from './downloadButton'
import { DesignFrameEdit, DesignFrameView } from './design_frame'
import { StageProgressEdit, StageProgressView } from './stage_progress'
import Switch from '../components/Switch'

const text = { EditComp: TextEdit, ViewComp: TextView }
const textarea = { EditComp: TextareaEdit, ViewComp: TextareaView }
const boolean = { EditComp: BooleanEdit, ViewComp: BooleanView }
const dmsFormat = { EditComp: DmsFormatEdit, ViewComp: DmsFormatView }
const multiselect = { EditComp: MultiselectEdit, ViewComp: MultiselectView }
const radio = { EditComp: RadioEdit, ViewComp: RadioView }
const checkbox = { EditComp: CheckboxEdit, ViewComp: CheckboxView }
const lexical = { EditComp: LexicalEdit, ViewComp: LexicalView }
const image = { EditComp: ImageEdit, ViewComp: ImageView }
const statusPill = { EditComp: StatusPillEdit, ViewComp: StatusPillView }
const delta = { EditComp: DeltaEdit, ViewComp: DeltaView }
const targetBar = { EditComp: TargetBarEdit, ViewComp: TargetBarView }
const dataBar = { EditComp: DataBarEdit, ViewComp: DataBarView }
const dataColorCell = { EditComp: DataColorCellEdit, ViewComp: DataColorCellView }
const verdictDot = { EditComp: VerdictDotEdit, ViewComp: VerdictDotView }
const statValue = { EditComp: StatValueEdit, ViewComp: StatValueView }
const codeWithSub = { EditComp: CodeWithSubEdit, ViewComp: CodeWithSubView }
const downloadButton = { EditComp: DownloadButtonEdit, ViewComp: DownloadButtonView }
const designFrame = { EditComp: DesignFrameEdit, ViewComp: DesignFrameView }
const stageProgress = { EditComp: StageProgressEdit, ViewComp: StageProgressView }

// console.log('in column types', Lexical)
// columnTypes is a mutable registry: themes can extend it via theme.columnTypes
// (auto-registered in patterns/page/siteConfig.jsx) using registerColumnType.
// We mutate this object in place so existing consumers that hold a reference
// (e.g. UI.ColumnTypes via ui/index.js) immediately see new entries.
const columnTypes = {
	'text': text,
  'textarea': textarea,
  'lexical': lexical,
  'number': {
      EditComp: (props) => <TextEdit {...props} type={'number'} />,
      ViewComp: (props) => <TextView {...props} type={'number'} />,
  },
  'date': {
      EditComp: (props) => <TextEdit {...props} type={'date'} />,
      ViewComp: (props) => <TextView {...props} type={'date'} />,
  },
  'timestamp': {
      EditComp: (props) => <TextEdit {...props} type={'datetime-local'} />,
      ViewComp: (props) => <TextView {...props} type={'datetime-local'} />,
  },
	'boolean': boolean,
	'dms-format': dmsFormat,
	'select': {
      EditComp: (props) => <MultiselectEdit {...props} singleSelectOnly={true} />,
      ViewComp: (props) => <MultiselectView {...props} singleSelectOnly={true} />,
	},
	'multiselect': multiselect,
	'radio': radio,
  'checkbox': checkbox,
  'image': image,
  'status_pill': statusPill,
  'delta': delta,
  'target_bar': targetBar,
  'data_bar': dataBar,
  'data_color_cell': dataColorCell,
  'verdict_dot': verdictDot,
  'stat_value': statValue,
  'code_with_sub': codeWithSub,
  'download_button': downloadButton,
  'design_frame': designFrame,
  'stage_progress': stageProgress,
  'switch': {
        EditComp: ({trueValue=true, value, onChange, ...props}) => {
            const offValue = typeof trueValue === 'boolean' ? !trueValue : null;
            const isEnabled = trueValue === false ? value !== true : value === trueValue;
            return <Switch {...props} enabled={isEnabled}
                    setEnabled={e => onChange(e ? trueValue : offValue)}
                    size={'small'} />;
        },
        ViewComp: ({trueValue=true, onChange, value, allowEditInView, ...props}) => {
            const offValue = typeof trueValue === 'boolean' ? !trueValue : null;
            const isEnabled = trueValue === false ? value !== true : value === trueValue;
            return <Switch {...props} enabled={isEnabled}
                    disabled={!allowEditInView}
                    setEnabled={allowEditInView ? (e => onChange(e ? trueValue : offValue)) : undefined}
                    size={'small'} />;
        },
    },
  'tree_node': { ViewComp: TreeNodeView },
  'publish_state': { ViewComp: PublishStateView },
  'sections_chip': { ViewComp: SectionsChipView },
  'last_published': { ViewComp: LastPublishedView },
  'activity_action_badge': { ViewComp: ActivityActionBadgeView },
	'default': text
}

export function registerColumnType(name, def) {
    if (!name || !def) return;
    columnTypes[name] = def;
}

export function getColumnTypes() {
    return columnTypes;
}

//console.log('columnTypes', columnTypes)
export default columnTypes;
