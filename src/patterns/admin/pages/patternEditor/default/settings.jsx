import React, {useContext, useState} from "react";
import { useImmer } from "use-immer";
import { isEqual } from "lodash-es";
import { AdminContext } from "../../../context";
import { ThemeContext } from "../../../../../ui/useTheme";


const customTheme = {
    field: 'pb-2 flex flex-col col-span-3'
}

export const PatternSettingsEditor = ({ value = {}, onChange, ...rest}) => {
  const { apiUpdate} = useContext(AdminContext);
  const { UI } = useContext(ThemeContext)
  const { FieldSet } = UI;
  const [tmpValue, setTmpValue] = useImmer(value);

  // React.useEffect(() => {
  //   console.log('value has changed, update');
  //   if(!isEqual(value, tmpValue)) setTmpValue(value);
  // }, [value]);

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
                  {
                    //label: 'Base Url',
                    type: 'Spacer',
                    customTheme: { field: 'bg-white ' }
                  },
                  {
                    //label: 'Base Url',
                    type: 'Button',
                    children: <span>Reset</span>,
                    buttonType: 'plain',
                    disabled: isEqual(tmpValue,value),
                    value: tmpValue.base_url,
                    onClick: () => setTmpValue(draft => value),
                    customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                  },
                  {
                    //label: 'Base Url',
                    type: 'Button',
                    children: <span>Save</span>,

                    disabled: isEqual(tmpValue,value),

                    onClick: () => apiUpdate({data:tmpValue}),
                    customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
                  },

              ]}
          />
        <pre>
            {JSON.stringify(tmpValue,null,3)}
        </pre>
      </div>
    )
}
