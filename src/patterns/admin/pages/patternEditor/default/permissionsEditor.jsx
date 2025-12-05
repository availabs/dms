import React from "react";
import {AuthContext} from "../../../../auth/context";
import {AdminContext} from "../../../context";

export const PatternPermissionsEditor = ({
     value={},
     onChange,
     permissionDomain,
     defaultPermission=[]
}) => {
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const {user, UI} = React.useContext(AdminContext);
    const {Permissions} = UI;

    return (
        <Permissions
            value={value}
            user={user}
            getUsers={AuthAPI.getUsers}
            getGroups={AuthAPI.getGroups}
            onChange={onChange}
            permissionDomain={permissionDomain}
            defaultPermission={defaultPermission}
        />
    )
}
