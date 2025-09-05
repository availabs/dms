import React from 'react'
import Text from './text'
import textarea from './textarea'
import boolean from './boolean'
import dmsFormat from './dms-format'
import Lexical from '../components/lexical'
import Multiselect from "./multiselect";
import Radio from "./radio";
import Checkbox from "./checkbox";
import Switch from "../components/Switch";

// console.log('in column types', Lexical)
const columnTypes = {
	'text': Text,
  'textarea': textarea,
  'lexical': Lexical,
  // 'lexical': {
  //     EditComp: (props) => <Text.EditComp {...props}  />,
  //     ViewComp: (props) => <Text.ViewComp {...props}  />,
  // },
  'number': {
      EditComp: (props) => <Text.EditComp {...props} type={'number'} />,
      ViewComp: (props) => <Text.ViewComp {...props} type={'number'} />,
  },
  'date': {
      EditComp: (props) => <Text.EditComp {...props} type={'date'} />,
      ViewComp: (props) => <Text.ViewComp {...props} type={'date'} />,
  },
  'timestamp': {
      EditComp: (props) => <Text.EditComp {...props} type={'datetime-local'} />,
      ViewComp: (props) => <Text.ViewComp {...props} type={'datetime-local'} />,
  },
	'boolean': boolean,
	'dms-format': dmsFormat,
	'select': {
      EditComp: (props) => <Multiselect.EditComp {...props} singleSelectOnly={true} />,
      ViewComp: (props) => <Multiselect.ViewComp {...props} singleSelectOnly={true} />,
	},
	'multiselect': Multiselect,
	'radio': Radio,
  'checkbox': Checkbox,
  'switch': {
        EditComp: ({trueValue=true, value, onChange, ...props}) =>
            <Switch {...props} enabled={value === trueValue}
                    setEnabled={e => onChange(e ? trueValue : false)}
                    size={'small'}
            />,
        ViewComp: ({trueValue=true, onChange, value, ...props}) =>
            <Switch {...props} enabled={value === trueValue} disabled={true} size={'small'}/>
    },
	'default': Text
}
//console.log('columnTypes', columnTypes)
export default columnTypes;
