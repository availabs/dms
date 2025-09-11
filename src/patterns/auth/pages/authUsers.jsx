import React, {useEffect, useMemo, useRef, useState} from "react";
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
    const [editUser, setEditUser] = React.useState();
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
        {name: '', display_name: '', show: true, type: 'ui',
        Comp: d => <Button onClick={() => setEditUser(d.row)}>reset password</Button>},
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
                    { attribute.name === 'email' ?
                        <InputControl show={attribute.name === 'email'}
                                      type={'text'}
                                      value={searchUser}
                                      onChange={setSearchUser}
                                      placeHolder={'search...'}/> :
                        attribute.name === 'groups' ?
                            <InputControl show={attribute.name === 'groups'}
                                          type={'text'}
                                          value={searchGroup}
                                          onChange={setSearchUGroup}
                                          placeHolder={'search...'}/> : null
                    }
                </div>
            )}}), [searchUser])
    const filteredUsers = useMemo(() => users.filter(r =>
        (!searchUser && !searchGroup) ||
        (searchUser && r.email.toLowerCase().includes(searchUser)) ||
        (searchGroup && r.groups.some(g => g.toLowerCase().includes(searchGroup)))),
        [users, searchUser, searchGroup]);
    const filteredRequests = useMemo(() => requests.filter(r => !searchRequest || r.user_email.toLowerCase().includes(searchRequest)), [requests, searchRequest])
    const customTableTheme = {tableContainer1: 'flex flex-col no-wrap min-h-[40px] max-h-[700px] overflow-y-auto'}

    if(!user?.authed) return <div>To access this page, you need to login.</div>

    return (
        <div className={'flex flex-col gap-3'}>
            <div className={'w-full flex justify-between border-b-2 border-blue-400'}>
                <div className={'text-2xl font-semibold text-gray-700'}>Users</div>
                <Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add new </Button>

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

            <Modal open={addingNew} setOpen={setAddingNew}>
                <div className={'flex flex-row gap-3'}>
                    <Input type={'text'}
                           value={newUser.email}
                           onChange={e => setNewUser({...newUser, email: e.target.value})}
                           placeHolder={'Please enter user email'}
                    />
                    <Button onClick={async () => {
                        setStatus('Adding');
                        await callAuthServer(`${AUTH_HOST}/signup/assign/group`,
                            {
                                token: user.token,
                                email: newUser.email,
                                url: window?.location?.host,
                                // group: newUser.group,
                                project: PROJECT_NAME
                            })
                            .then(res => {
                                console.log('res', res)
                                if (res.error) {
                                    setStatus(res.error)
                                } else {
                                    setStatus('')
                                }
                            })
                            .catch(error => {
                                console.error('Cannot contact authentication server.');
                            });
                        setNewUser({email: ''})
                        setStatus('');
                    }}>{status || 'Add'}</Button>
                </div>
            </Modal>

            <Modal open={Boolean(editUser)} setOpen={setEditUser}>
                <div className={'flex flex-row gap-3'}>
                    Are you sure you want to reset password for user: {editUser?.email}?
                    <Button
                        type={'plain'}
                        className={`${theme?.forgotPasswordButton}`}
                        onClick={async () => {
                            await callAuthServer(`${AUTH_HOST}/password/reset`,
                                {
                                    project_name: PROJECT_NAME,
                                    email: editUser?.email,
                                    host: `${window?.location?.host}`,
                                    url: `/${baseUrl}/login`
                                })
                                .then(res => {
                                    if (res.error) {
                                        setStatus(res.error)
                                        console.error('Error', res.error)
                                    } else {
                                        setStatus(res.message)
                                        // navigate(`${baseUrl}/login`)
                                    }
                                })
                                .catch(error => {
                                    setStatus('Cannot contact authentication server.')
                                    console.error('Cannot contact authentication server.');
                                });
                        }}> <span className={`text-sm ${theme?.dataCard?.value}`}> {status || "reset"} </span> </Button>
                </div>
            </Modal>
        </div>
    )
}