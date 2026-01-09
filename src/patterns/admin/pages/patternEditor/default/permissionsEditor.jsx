import React from "react";
import { useImmer } from "use-immer";
import { isEqual, set, cloneDeep } from "lodash-es";

import { AuthContext } from "../../../../auth/context";
import { AdminContext } from "../../../context";
import { parseIfJSON } from "../../../../page/pages/_utils";
import { ThemeContext } from "../../../../../ui/useTheme";

export const PatternPermissionsEditor = ({
     value="{}",
     onChange,
     attributes,
     defaultPermission=[]
}) => {
  let inputValue = cloneDeep(parseIfJSON(value))
  if (!inputValue.authPermissions?.groups?.public) {
      set(inputValue,'authPermissions.groups.public', ['view-page']);
  }
  const {AuthAPI} = React.useContext(AuthContext) || {};
  const { UI} = React.useContext(ThemeContext)
  const { user, apiUpdate } = React.useContext(AdminContext) || {};
  const {Permissions, FieldSet} = UI;
  const [tmpValue, setTmpValue] = React.useState(parseIfJSON(inputValue));
  const permissionDomain = attributes?.authPermissions?.permissionDomain
  //





  return (
    <div className="max-w-5xl">
    <Permissions
        value={tmpValue?.authPermissions || {}}
        user={user}
        getUsers={AuthAPI.getUsers}
        getGroups={AuthAPI.getGroups}
        onChange={(v) => setTmpValue({...tmpValue, 'authPermissions': v})}
        permissionDomain={permissionDomain}
        defaultPermission={defaultPermission}
    />
    <FieldSet
        className={'grid grid-cols-12 gap-1 border rounded p-4'}
        components={[
            {
              type: 'Spacer',
              customTheme: { field: 'bg-white col-span-10 ' }
            },
            {
              type: 'Button',
              children: <span>Reset</span>,
              buttonType: 'plain',
              disabled: isEqual(tmpValue,value),
              value: tmpValue.base_url,
              onClick: () => setTmpValue(draft => value),
              customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
            },
            {
              type: 'Button',
              children: <span>Save</span>,
              disabled: isEqual(tmpValue,value),
              onClick: () => apiUpdate({data:tmpValue}),
              customTheme: { field: 'pb-2 col-span-1 flex justify-end' }
            }
        ]}
    />
    </div>
  )
}
