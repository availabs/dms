import React, {useEffect} from 'react'
import {set} from 'lodash-es'
import {PageContext, CMSContext} from '../../../context'
import {ThemeContext} from "../../../../../ui/useTheme";
import {AuthContext} from "../../../../auth/context";

function PermissionsPane() {
    const {theme} = React.useContext(ThemeContext);
    const {UI, user} = React.useContext(CMSContext) || {}
    const {item, apiUpdate} = React.useContext(PageContext) || {}
    const {AuthAPI} = React.useContext(AuthContext) || {};
    const [authPermissions, setAuthPermissions] = React.useState(item.authPermissions || '');
    const {Permissions} = UI;
    const permissionDomain = [
        {label: 'Edit Page', value: 'edit'},
        {label: 'Delete Page', value: 'delete'},
    ]
    const defaultPermission = ['view'];

    useEffect(() => {
        let isStale = false;

        setTimeout(() => {
            if (!isStale) {
                return togglePageSetting(item, 'authPermissions', authPermissions, apiUpdate)
            }
        }, 300);

        return () => {
            isStale = true;
        }
    }, [authPermissions]);

    return (
        <div className="flex h-full flex-col">
            <div className="px-4 sm:px-6 py-2">
                <div className="flex items-start justify-between">
                    <h1 className="text-base font-semibold leading-6 text-gray-900">
                        Permissions
                    </h1>
                </div>
            </div>

            <div className="relative mt-6 flex-1 px-4 sm:px-6 w-full   max-h-[calc(100vh_-_135px)] overflow-y-auto">
                <Permissions
                    value={authPermissions}
                    onChange={setAuthPermissions}
                    user={user}
                    getUsers={AuthAPI.getUsers}
                    getGroups={AuthAPI.getGroups}
                    permissionDomain={permissionDomain}
                    defaultPermission={defaultPermission}
                />
            </div>
        </div>
    )
}

export default PermissionsPane

export const togglePageSetting = async (item, type, value = '', apiUpdate) => {
    const newItem = {id: item.id}
    set(newItem, type, value)
    console.log('update', type, newItem)
    apiUpdate({data: newItem})
}



