import React, {useEffect, useMemo, useRef, useState} from "react";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";
import {isEqual} from "lodash-es";

const InputControl = ({show, value, onChange, placeHolder}) => {
    const { UI } = React.useContext(ThemeContext);
    const { Input } = UI;

    const [tmpValue, setTmpValue] = useState(value);

    useEffect(() => {
        if (!isEqual(value, tmpValue)) setTmpValue(value)
    }, [value]);

    useEffect(() => {
        if (!show) return;
        const id = setTimeout(() => {
            onChange(tmpValue);
        }, 300);
        return () => clearTimeout(id);
    }, [tmpValue, show, onChange]);

    if (!show) return null;
    return (
        <Input
            type="text"
            value={tmpValue}
            onChange={e => setTmpValue(e.target.value)}
            placeHolder={placeHolder}
        />
    );
};

function AddUserModal({ open, setOpen, onAdd, loading }) {
    const { UI } = React.useContext(ThemeContext);
    const { Modal, Input, Button } = UI;
    const [email, setEmail] = useState("");

    return (
        <Modal open={open} setOpen={setOpen}>
            <div className="flex flex-row gap-3">
                <Input
                    type="text"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeHolder="Enter user email"
                />
                <Button onClick={() => onAdd(email)}>
                    {loading ? "Adding" : "Add"}
                </Button>
            </div>
        </Modal>
    );
}

export default function UsersAdmin() {
    const [groups, setGroups] = useState([]);
    const [users, setUsers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [searchUser, setSearchUser] = useState('');
    const [searchGroup, setSearchGroup] = useState('');
    const [searchRequest, setSearchRequest] = useState('');
    const [addingNew, setAddingNew] = useState(false);
    const [loadingAdd, setLoadingAdd] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [status, setStatus] = useState('');
    const { UI } = React.useContext(ThemeContext);
    const { user, AUTH_HOST, PROJECT_NAME, baseUrl } = React.useContext(AuthContext);
    const gridRef = useRef(null);
    const { Modal, Table, Button } = UI;

    const handleAddUser = async (email) => {
        setLoadingAdd(true);
        await callAuthServer(`${AUTH_HOST}/signup/assign/group`, {
            token: user.token,
            email,
            url: window?.location?.host,
            project: PROJECT_NAME
        });
        setLoadingAdd(false);
        setAddingNew(false);
    };

    /* ---------------------- Load Data (parallel) ---------------------- */
    useEffect(() => {
        if (!PROJECT_NAME) return;

        const load = async () => {
            const [gRes, uRes, rRes] = await Promise.all([
                callAuthServer(`${AUTH_HOST}/groups/byproject`, {
                    token: user.token,
                    project: PROJECT_NAME
                }),
                callAuthServer(`${AUTH_HOST}/users/byProject`, {
                    token: user.token,
                    project: PROJECT_NAME
                }),
                callAuthServer(`${AUTH_HOST}/requests/byProject`, {
                    token: user.token,
                    project_name: PROJECT_NAME
                }),
            ]);

            if (!gRes.error) setGroups(gRes.groups || []);
            if (!uRes.error) setUsers((uRes.users || []).filter(u => u.email !== user.email));
            if (!rRes.error) setRequests(rRes.requests || []);
        };

        load();
    }, [PROJECT_NAME, AUTH_HOST, user.token, user.email]);

    /* --------------------------- Table columns --------------------------- */

    // const requestsColumns = [
    //     {name: 'user_email', display_name: 'User', show: true, type: 'text', size: 500},
    //     {name: 'state', display_name: 'Status', show: true, type: 'select', size: 100},
    //     {
    //         name: 'approve', display_name: ' ', show: true, type: 'ui', size: 550,
    //         Comp: ({row}) => {
    //             const [groupName, setGroupName] = useState('');
    //             return (
    //                 <>
    //                     <Select
    //                         value={groupName}
    //                         onChange={e => setGroupName(e.target.value)}
    //                         options={[{label: 'Select group...', value: ''}, ...groups.map(({name}) => ({label: name, value: name}))]}
    //                     />
    //                     <Button disabled={!groupName}
    //                             onClick={async () => {
    //                                 await callAuthServer(`${AUTH_HOST}/signup/accept`, {
    //                                     token: user.token,
    //                                     user_email: row.user_email,
    //                                     project_name: PROJECT_NAME,
    //                                     group_name: groupName,
    //                                     host: `${window.location.host}/`,
    //                                     url: 'dms_auth/password/set'
    //                                 });
    //                             }}>Approve</Button>
    //                 </>
    //             )
    //         }
    //     },
    //     {
    //         name: 'reject', display_name: ' ', show: true, type: 'ui', size: 100,
    //         Comp: ({row}) => (
    //             <Button onClick={async () => {
    //                 await callAuthServer(`${AUTH_HOST}/signup/reject`, {
    //                     token: user.token,
    //                     user_email: row.user_email,
    //                     project_name: PROJECT_NAME,
    //                 });
    //             }}>Reject</Button>
    //         )
    //     }
    // ];

    const userColumns = [
        {name: 'email', display_name: 'User', show: true, type: 'text'},
        {name: 'groups', display_name: 'Groups', show: true, type: 'multiselect', options: groups.map(g => g.name)},
        {
            name: '', display_name: '', show: true, type: 'ui',
            Comp: d => <Button onClick={() => setEditUser(d.row)}>reset password</Button>
        },
    ];


    const usersTableControls = useMemo(() => ({
        header: {
            displayFn: (attribute) => (
                <div className="flex gap-3 items-center">
                    {attribute.display_name}
                    { attribute.name === 'email' &&
                        <InputControl show value={searchUser} onChange={setSearchUser} placeHolder="search..."/> }
                    { attribute.name === 'groups' &&
                        <InputControl show value={searchGroup} onChange={setSearchGroup} placeHolder="filter group..."/> }
                </div>
            )
        }
    }), [searchUser, searchGroup]);

    // const requestsTableControls = {
    //     header: {
    //         displayFn: (attribute) => (
    //             <div className="flex gap-3 items-center">
    //                 {attribute.display_name}
    //                 {attribute.name === 'user_email' &&
    //                     <InputControl show value={searchRequest} onChange={setSearchRequest} placeHolder="search..."/>}
    //             </div>
    //         )
    //     }
    // };

    const filteredUsers = useMemo(() => {
        const su = searchUser.toLowerCase();
        const sg = searchGroup.toLowerCase();

        return users.filter(u => {
            if (su && !u.email.toLowerCase().includes(su)) return false;
            if (sg && !(u.groups || []).some(g => g.toLowerCase().includes(sg))) return false;
            return true;
        });
    }, [users, searchUser, searchGroup]);

    // const filteredRequests = useMemo(() => {
    //     const sr = searchRequest.toLowerCase();
    //     return sr ? requests.filter(r => r.user_email.toLowerCase().includes(sr)) : requests;
    // }, [requests, searchRequest]);

    const customTableTheme = {
        tableContainer1: 'flex flex-col no-wrap min-h-[40px] max-h-[700px] overflow-y-auto'
    };

    /* -------------------------------- Render -------------------------------- */

    if (!user?.authed) return <div>To access this page, you need to login.</div>;

    return (
        <div className="flex flex-col gap-3">

            <div className="w-full flex justify-between border-b-2 border-blue-400">
                <div className="text-2xl font-semibold text-gray-700">Users</div>
                <Button className="shrink-0" onClick={() => setAddingNew(true)}>Add new</Button>
            </div>

            {/* <Table data={filteredRequests} columns={requestsColumns} controls={requestsTableControls} customTheme={customTableTheme} /> */}

            <Table
                gridRef={gridRef}
                data={filteredUsers}
                columns={userColumns}
                allowEdit={true}
                updateItem={async (_, __, e) => {
                    const original = users.find(u => u.email === e.email);

                    const added = e.groups.find(g => !(original.groups || []).includes(g));
                    const removed = original.groups?.find(g => !(e.groups || []).includes(g));

                    if (added) {
                        await callAuthServer(`${AUTH_HOST}/user/group/assign`, {
                            token: user.token,
                            user_email: original.email,
                            group_name: added,
                        });
                    }
                    if (removed) {
                        await callAuthServer(`${AUTH_HOST}/user/group/remove`, {
                            token: user.token,
                            user_email: original.email,
                            group_name: removed,
                        });
                    }
                }}
                controls={usersTableControls}
                customTheme={customTableTheme}
            />

            {/* Add user modal */}
            <AddUserModal
                open={addingNew}
                setOpen={setAddingNew}
                onAdd={handleAddUser}
                loading={loadingAdd}
            />

            {/* Reset password modal */}
            <Modal open={Boolean(editUser)} setOpen={setEditUser}>
                <div className="flex flex-row gap-3">
                    Reset password for: {editUser?.email}?
                    <Button onClick={async () => {
                        const res = await callAuthServer(`${AUTH_HOST}/password/reset`, {
                            project_name: PROJECT_NAME,
                            email: editUser?.email,
                            host: `${window?.location?.host}`,
                            url: `/${baseUrl}/login`
                        });
                        setStatus(res.error || res.message);
                    }}>
                        {status || "reset"}
                    </Button>
                </div>
            </Modal>
        </div>
    );
}
