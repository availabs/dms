import React from "react";
import { AuthContext } from "../../../../auth/context";
import { AdminContext } from "../../../context";
import { parseIfJSON } from "../../../../page/pages/_utils";

export const PatternPermissionsEditor = ({
     value="{}",
     onChange,
     permissionDomain,
     defaultPermission=[]
}) => {
  const {AuthAPI} = React.useContext(AuthContext) || {};
  const { user, UI } = React.useContext(AdminContext) || {};
  const {Permissions} = UI;

  //console.log('value', value)
  const authPermissions = parseIfJSON(value);
  if(!authPermissions?.groups?.public){
      // default public permissions. overridden by set permissions
      authPermissions.groups ??= {};
      authPermissions.groups.public ??= ['view-page'];
  }

  return (
    <Permissions
        value={authPermissions}
        user={user}
        getUsers={AuthAPI.getUsers}
        getGroups={AuthAPI.getGroups}
        onChange={onChange}
        permissionDomain={permissionDomain}
        defaultPermission={defaultPermission}
    />
  )
}
