import React, {useContext, useState} from "react";
import { useImmer } from "use-immer";
import { AdminContext } from "../../../context";


const customTheme = {
    field: 'pb-2 flex flex-col col-span-2'
}

export const PatternSettingsEditor = ({ value = {}, onChange, ...rest}) => {
  const {UI} = useContext(AdminContext);
  const { FieldSet } = UI;

  const [tmpValue, setTmpValue] = useImmer(value);
  console.log('tmpValue', tmpValue)
    // const [newFilter, setNewFilter] = useState({});
    // const {FieldSet, Button} = UI;

    return (
      <div className={'flex flex-col gap-1 p-4 border rounded-md'}>


        <span className='font-semibold text-lg'>Page Settings</span>
          <FieldSet
              className={'grid grid-cols-3 gap-1 border rounded p-4'}
              components={[
                  {
                    label: 'Name',
                    type: 'Input',
                    placeholder: 'Site Name',
                    value: tmpValue.name,
                    onChange: e => setTmpValue(draft => {
                      draft.name = e.target.value
                    }),
                    customTheme
                  },
                  {
                    label: 'Subdomain',
                    type: 'Input',
                    placeholder: '',
                    value: tmpValue.subdomain,
                    onChange: e => setTmpValue(draft => {
                      draft.subdomain = e.target.value
                    }),
                    customTheme
                  },
                  {
                    label: 'Base Url',
                    type: 'Input',
                    placeholder: '/',
                    value: tmpValue.base_url,
                    onChange: e => setTmpValue(draft => {
                      draft.base_url = e.target.value
                    }),
                    customTheme
                  },

              ]}
          />
        <pre>
            {JSON.stringify(tmpValue,null,3)}
        </pre>
      </div>
    )
}
