import React from 'react'
import { TextEdit, TextView } from './text'
import { TextareaEdit, TextareaView } from './textarea'
import { BooleanEdit, BooleanView } from './boolean'
import { DmsFormatEdit, DmsFormatView } from './dms-format'
import { LexicalEdit, LexicalView } from '../components/lexical'
import { MultiselectEdit, MultiselectView } from './multiselect'
import { RadioEdit, RadioView } from './radio'
import { CheckboxEdit, CheckboxView } from './checkbox'
import Switch from '../components/Switch'

const text = { EditComp: TextEdit, ViewComp: TextView }
const textarea = { EditComp: TextareaEdit, ViewComp: TextareaView }
const boolean = { EditComp: BooleanEdit, ViewComp: BooleanView }
const dmsFormat = { EditComp: DmsFormatEdit, ViewComp: DmsFormatView }
const multiselect = { EditComp: MultiselectEdit, ViewComp: MultiselectView }
const radio = { EditComp: RadioEdit, ViewComp: RadioView }
const checkbox = { EditComp: CheckboxEdit, ViewComp: CheckboxView }
const lexical = { EditComp: LexicalEdit, ViewComp: LexicalView }

// console.log('in column types', Lexical)
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
  'switch': {
        EditComp: ({trueValue=true, value, onChange, ...props}) =>
            <Switch {...props} enabled={value === trueValue}
                    setEnabled={e => onChange(e ? trueValue : false)}
                    size={'small'}
            />,
        ViewComp: ({trueValue=true, onChange, value, ...props}) =>
            <Switch {...props} enabled={value === trueValue} disabled={true} size={'small'}/>
    },
	'default': text
}
//console.log('columnTypes', columnTypes)
export default columnTypes;
