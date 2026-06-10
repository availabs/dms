import React, {useEffect, useMemo, useRef, useState} from "react";
import {ThemeContext, getComponentTheme} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";
import {isEqual} from "lodash-es";
import { isUserAuthed } from "../../../utils/auth";

const AVATAR_COLORS = ['bg-[#5D8A85]', 'bg-[#B45309]', 'bg-[#B5532C]', 'bg-[#4A5160]', 'bg-[#2A2F36]'];

function colorIndex(str) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return h % AVATAR_COLORS.length;
}

function UserAvatar({ email, t }) {
  const initials = (email || '').slice(0, 2).toUpperCase();
  const color = AVATAR_COLORS[colorIndex(email)];
  return (
    <span className={`${t.avatar || ''} ${color} rounded-full`} title={email}>{initials}</span>
  );
}

function GroupBadges({ groups, t }) {
  return (
    <div className="flex flex-wrap gap-1">
      {(groups || []).map(g => {
        const variant = /admin/i.test(g) ? t.groupPillAdmin || ''
          : /edit|steward|author/i.test(g) ? t.groupPillEditor || ''
          : '';
        return <span key={g} className={`${t.groupPill || ''} ${variant}`}>{g}</span>;
      })}
    </div>
  );
}

function StatusDot({ lastLogin, t }) {
  const now = Date.now();
  const ts = lastLogin ? new Date(lastLogin).getTime() : 0;
  const daysDiff = (now - ts) / (1000 * 60 * 60 * 24);
  let cls, label;
  if (!lastLogin) { cls = t.statusDotPending || ''; label = 'Never logged in'; }
  else if (daysDiff <= 30) { cls = t.statusDotActive || ''; label = 'Active'; }
  else { cls = t.statusDotInactive || ''; label = 'Inactive'; }
  return <span className={cls} title={label} />;
}

function UserKpiStrip({ users, groups, t }) {
  const now = Date.now();
  const activeCount = users.filter(u => {
    const ts = u.last_login ? new Date(u.last_login).getTime() : 0;
    return (now - ts) / (1000 * 60 * 60 * 24) <= 30;
  }).length;
  const pendingCount = users.filter(u => !u.last_login).length;
  const cells = [
    { label: 'Total Users', value: users.length },
    { label: 'Active (30d)', value: activeCount },
    { label: 'Never Logged In', value: pendingCount },
    { label: 'Groups', value: groups.length },
  ];
  return (
    <div className={`${t.kpiStrip || ''} grid-cols-4 mb-4`}>
      {cells.map(({ label, value }) => (
        <div key={label} className={t.kpiCell || ''}>
          <div className={t.kpiLabel || ''}>{label}</div>
          <div className={t.kpiValue || ''}>{value}</div>
        </div>
      ))}
    </div>
  );
}

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

function AddUserModal({ open, setOpen, onAdd, loading, status }) {
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
                    {loading ? "Adding" : status || "Add"}
                </Button>
            </div>
        </Modal>
    );
}

export default function UsersAdmin({ app = '', authPermissions = {} }) {
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
    const [activeTab, setActiveTab] = useState('all');
    const { UI, theme: themeFromContext = {} } = React.useContext(ThemeContext);
    const t = getComponentTheme(themeFromContext, 'admin');
    const { user, AUTH_HOST, PROJECT_NAME, baseUrl, viewAsUser, setViewAsUser } = React.useContext(AuthContext);
    const canViewAs = (user?.groups || []).some(g => g === `${app} Admin`)
      || isUserAuthed({ user, authPermissions, reqPermissions: ['view-as'] });
    const gridRef = useRef(null);
    const { Modal, Table, Button } = UI;

    const loadUsers = async () => {
        const uRes = await callAuthServer(`${AUTH_HOST}/users/byProject`, {
            token: user.token,
            project: PROJECT_NAME
        });
        if (!uRes.error) setUsers((uRes.users || []));
    };

    const handleAddUser = async (email) => {
        setLoadingAdd(true);
        const res = await callAuthServer(`${AUTH_HOST}/signup/assign/group`, {
            token: user.token,
            email,
            url: `${window.location.origin}${baseUrl}/login`,
            project: PROJECT_NAME
        });

        if(!res.error){
            await loadUsers();
            setLoadingAdd(false);
            setAddingNew(false);
        }else{
            setStatus(res.error)
        }
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
            if (!uRes.error) setUsers((uRes.users || []));
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

    const fmtDate = ts => {
        if (!ts) return '—';
        const d = new Date(ts);
        return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    };

    const userColumns = [
        {name: 'avatar', display_name: '', show: true, type: 'ui',
            Comp: ({ row }) => <UserAvatar email={row.email} t={t} />},
        {name: 'email', display_name: 'User', show: true, type: 'text'},
        {name: 'groups', display_name: 'Groups', show: true, type: 'multiselect', options: groups.map(g => g.name)},
        {name: 'status', display_name: 'Status', show: true, type: 'ui',
            Comp: ({ row }) => <StatusDot lastLogin={row.last_login} t={t} />},
        {name: 'created_at', display_name: 'Created', show: true, type: 'ui',
            Comp: ({ row }) => <span className="text-sm text-slate-400">{fmtDate(row.created_at)}</span>},
        {name: 'last_login', display_name: 'Last Login', show: true, type: 'ui',
            Comp: ({ row }) => <span className="text-sm text-slate-400">{fmtDate(row.last_login)}</span>},
        {
            name: 'view_as', display_name: '', show: canViewAs, type: 'ui',
            Comp: ({ row }) => {
                const isActive = viewAsUser?.email === row.email;
                return (
                    <Button
                        onClick={() => setViewAsUser(isActive ? null : { ...row, groups: [...new Set([...(row.groups || []), 'public'])], authed: true, isAuthenticating: false })}
                    >
                        {isActive ? 'Viewing As' : 'View As'}
                    </Button>
                );
            }
        },
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

        return users
            .filter(u => {
                if (activeTab === 'pending' && u.last_login) return false;
                if (su && !u.email.toLowerCase().includes(su)) return false;
                if (sg && !(u.groups || []).some(g => g.toLowerCase().includes(sg))) return false;
                return true;
            })
            .sort((a, b) => {
                if (!a.last_login && !b.last_login) return 0;
                if (!a.last_login) return 1;
                if (!b.last_login) return -1;
                return new Date(b.last_login) - new Date(a.last_login);
            });
    }, [users, searchUser, searchGroup, activeTab]);

    const pendingCount = useMemo(() => users.filter(u => !u.last_login).length, [users]);

    // const filteredRequests = useMemo(() => {
    //     const sr = searchRequest.toLowerCase();
    //     return sr ? requests.filter(r => r.user_email.toLowerCase().includes(sr)) : requests;
    // }, [requests, searchRequest]);

    const customTableTheme = {
        tableContainer1: 'flex flex-col no-wrap min-h-[40px] max-h-[700px] overflow-y-auto'
    };

    /* -------------------------------- Render -------------------------------- */

    if (!user?.authed) return <div>To access this page, you need to login.</div>;

    const tabs = [
      { id: 'all', label: 'All Users', count: users.length },
      { id: 'pending', label: 'Never Logged In', count: pendingCount },
    ];

    return (
        <div className="flex flex-col gap-3">

            <div className={t.pageHeader || 'w-full flex justify-between border-b-2 border-blue-400'}>
                <div className={t.pageTitle || 'text-2xl font-semibold text-gray-700'}>Users</div>
                <Button className="shrink-0" onClick={() => setAddingNew(true)}>Add new</Button>
            </div>

            {users.length > 0 && <UserKpiStrip users={users} groups={groups} t={t} />}

            <div className={t.tabStrip || 'flex border-b gap-0 mb-2'}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`${t.tab || ''} ${activeTab === tab.id ? t.tabActive || '' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  <span className={t.tabCount || 'ml-1 text-xs'}>{tab.count}</span>
                </button>
              ))}
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
            />

            {/* Add user modal */}
            <AddUserModal
                open={addingNew}
                setOpen={setAddingNew}
                onAdd={handleAddUser}
                loading={loadingAdd}
                status={status}
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
                            url: `${baseUrl}/login`
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
