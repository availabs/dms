import React, {useEffect, useMemo, useRef, useState} from "react";
import {useNavigate, Link} from "react-router";
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
    const [searchRequest, setSearchRequest] = React.useState('');
    const {theme} = React.useContext(ThemeContext);
    const {UI, user, AUTH_HOST, PROJECT_NAME, defaultRedirectUrl, ...restAuthContext} = React.useContext(AuthContext);
    const gridRef = useRef(null)
    const {Table, Input, Select, Button} = UI;
    const navigate = useNavigate();

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

    const requestsColumns = [
        {name: 'user_email', display_name: 'User', show: true, type: 'text', size: 500},
        {name: 'state', display_name: 'Status', show: true, type: 'select', size: 100},
        {name: 'approve', display_name: ' ', show: true, type: 'ui', size: 550,
            Comp: ({row}) => {
            const [groupName, setGroupName] = useState('');
                return (
                    <>
                        <Select
                            value={groupName}
                            onChange={e => setGroupName(e.target.value)}
                            options={[{name: 'Please select a group...'}, ...groups].map(({name}) => ({label: name, value: name}))}
                        />
                        <Button disabled={!groupName}
                                onClick={async () => {
                                    return  await callAuthServer(`${AUTH_HOST}/signup/accept`,
                                        {
                                            token: user.token,
                                            user_email: row.user_email,
                                            project_name: PROJECT_NAME,
                                            group_name: groupName,
                                            host: `${window.location.host}/`,
                                            url: 'dms_auth/password/set'
                                        })
                                        .then(res => {
                                            console.log('res', res)
                                            if (res.error) {
                                                console.error('Error', res.error)
                                            } else {
                                                console.log(`Signup request accepted for user: ${row.user_email}`)
                                            }
                                        })
                                        .catch(error => {
                                            console.error('Cannot contact authentication server.');
                                        });
                                }}>Approve</Button>
                    </>
                )
            }},
        {name: 'reject', display_name: ' ', show: true, type: 'ui', size: 100,
            Comp: ({row}) => {
                return (
                    <>
                        <Button onClick={async () => {
                            return  await callAuthServer(`${AUTH_HOST}/signup/reject`,
                                {
                                    token: user.token,
                                    user_email: row.user_email,
                                    project_name: PROJECT_NAME,
                                })
                                .then(res => {
                                    console.log('res', res)
                                    if (res.error) {
                                        console.error('Error', res.error)
                                    } else {
                                        console.log(`Signup request rejected for user: ${row.user_email}`)
                                    }
                                })
                                .catch(error => {
                                    console.error('Cannot contact authentication server.');
                                });
                        }}>Reject</Button>
                    </>
                )
            }}
    ]

    const userColumns = [
        {name: 'email', display_name: 'User', show: true, type: 'text'},
        {name: 'groups', display_name: 'Groups', show: true, type: 'multiselect', options: groups.map(g => g.name)},
    ]

    const InputControl = ({show, value, onChange, placeHolder}) => {
        const [tmpValue, setTmpValue] = useState(value);

        useEffect(() => {
            let isStale = false;

            setTimeout(() => {
                if (!isStale) {
                    onChange(tmpValue)
                }
            }, 300);

            return () => {
                isStale = true;
            }
        }, [tmpValue]);

        if(!show) return;
        return <Input type={'text'} value={tmpValue} onChange={e => setTmpValue(e.target.value)} placeHolder={placeHolder}/>
    }
    const requesstTableControls = {
        header: {
            displayFn: (attribute) => (
                <div className={'flex gap-3 items-center'}>
                    {attribute.display_name}
                    <InputControl show={attribute.name === 'user_email'}
                                  type={'text'}
                                  value={searchRequest}
                                  onChange={setSearchRequest}
                                  placeHolder={'search...'}/>
                </div>
            )}}

    const usersTableControls = useMemo(() => ({
        header: {
            displayFn: (attribute) => (
                <div className={'flex gap-3 items-center'}>
                    {attribute.display_name}
                    <InputControl show={attribute.name === 'email'}
                                  type={'text'}
                                  value={searchUser}
                                  onChange={setSearchUser}
                                  placeHolder={'search...'}/>
                </div>
            )}}), [searchUser])
    const filteredUsers = useMemo(() => users.filter(r => !searchUser || r.email.toLowerCase().includes(searchUser)), [users, searchUser]);
    const filteredRequests = useMemo(() => requests.filter(r => !searchRequest || r.user_email.toLowerCase().includes(searchRequest)), [requests, searchRequest])
    const customTableTheme = {tableContainer1: 'flex flex-col no-wrap min-h-[40px] max-h-[700px] overflow-y-auto'}

    if(!user?.authed) return <div>To access this page, you need to login.</div>

    return (
        <div className={'flex flex-col gap-3'}>
            <div className={'w-full flex justify-between border-b-2 border-blue-400'}>
                <div className={'text-2xl font-semibold text-gray-700'}>Users</div>
            </div>
            {/*<div className={''}>
                <div>Requests</div>
                    <Table data={filteredRequests}
                           columns={requestsColumns}
                           controls={requesstTableControls}
                           customTheme={customTableTheme}
                    />
            </div>*/}

            <div className={''}>
                    <Table gridRef={gridRef}
                           data={filteredUsers}
                           columns={userColumns}
                           allowEdit={true}
                           updateItem={async (_, __, e) => {
                               const originalUser = users.find(({email}) => email === e.email);
                               const groupsAdded = e.groups.find(g => !(originalUser?.groups || []).includes(g));
                               const groupsRemoved = (originalUser.groups || []).find(g => !(e.groups || []).includes(g));
                               console.log(originalUser.email, groupsAdded, groupsRemoved)

                               if(groupsAdded) {
                                   await callAuthServer(`${AUTH_HOST}/user/group/assign`,
                                       {
                                           token: user.token,
                                           user_email: originalUser.email,
                                           group_name: groupsAdded,
                                       })
                                       .then(res => {
                                           console.log('res', res)
                                           if (res.error) {
                                               console.error('Error', res.error)
                                           } else {
                                               console.log(`Group ${groupsRemoved} added for user ${originalUser.email}`)
                                           }
                                       })
                                       .catch(error => {
                                           console.error('Cannot contact authentication server.');
                                       });
                               }

                               if(groupsRemoved) {
                                   await callAuthServer(`${AUTH_HOST}/user/group/remove`,
                                       {
                                           token: user.token,
                                           user_email: originalUser.email,
                                           group_name: groupsRemoved,
                                       })
                                       .then(res => {
                                           console.log('res', res)
                                           if (res.error) {
                                               console.error('Error', res.error)
                                           } else {
                                               console.log(`Group ${groupsRemoved} removed for user ${originalUser.email}`)
                                           }
                                       })
                                       .catch(error => {
                                           console.error('Cannot contact authentication server.');
                                       });
                               }
                           }}
                           controls={usersTableControls}
                           customTheme={customTableTheme}
                    />
            </div>
        </div>
    )
}