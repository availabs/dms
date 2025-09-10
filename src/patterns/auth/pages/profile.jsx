import React, {useEffect, useMemo, useRef, useState} from "react";
import {Link} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../siteConfig";
import {callAuthServer} from "../utils";

// list users: dropdown to change groups
// list user requests: two buttons to accept and reject
// admin should be able to set user permissions.
// permit users for pattern, and actions in the pattern (CRUD pages, sections)
export default (props) => {
    const [groups, setGroups] = React.useState([]);
    const [users, setUsers] = React.useState([]);
    const [requests, setRequests] = React.useState([]);
    const [searchUser, setSearchUser] = React.useState('');
    const [searchGroup, setSearchUGroup] = React.useState('');
    const [searchRequest, setSearchRequest] = React.useState('');
    const [newUser, setNewUser] = React.useState({});
    const [addingNew, setAddingNew] = React.useState(false);
    const [status, setStatus] = React.useState('');
    const {theme} = React.useContext(ThemeContext);
    const {UI, user, AUTH_HOST, PROJECT_NAME, defaultRedirectUrl, baseUrl, ...restAuthContext} = React.useContext(AuthContext);
    const gridRef = useRef(null)
    const {Modal, Table, Input, Select, Button} = UI;

    useEffect(() => {
        async function loadGroups(){
            await callAuthServer(`${AUTH_HOST}/groups/byproject`, {
                token: user.token,
                project: PROJECT_NAME
            }).then(res => {
                if(res.error){
                    console.error(res.error);
                }else{
                    setGroups(res.groups || [])
                }
            });
        }
        async function loadUsers(){
            await callAuthServer(`${AUTH_HOST}/users/byProject`, {
                token: user.token,
                project: PROJECT_NAME
            }).then(res => {
                if(res.error){
                    console.error(res.error);
                }else{
                    setUsers((res.users || []).filter(u => u.email !== user.email)) // all users in the project, except logged in user
                }
            });
        }
        async function loadRequests(){
            await callAuthServer(`${AUTH_HOST}/requests/byProject`, {
                token: user.token,
                project_name: PROJECT_NAME
            }).then(res => {
                if(res.error){
                    console.error(res.error);
                }else{
                    setRequests(res.requests || [])
                }
            });
        }

        loadGroups();
        loadUsers()
        loadRequests();
    }, [PROJECT_NAME]);

    if(!user?.authed) return <div>To access this page, you need to login.</div>

    return (
        <div className={'flex flex-col'}>
            <div className={'w-full flex justify-between border-b-2 border-blue-400'}>
                <div className={'text-2xl font-semibold text-gray-700'}>{user.email}</div>
            </div>
            <Link to={`${baseUrl}/password/reset`} >Reset Password</Link>
        </div>
    )
}