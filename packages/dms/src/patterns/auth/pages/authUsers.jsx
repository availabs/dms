import React, {useEffect, useMemo, useRef, useState} from "react";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";
import {isEqual} from "lodash-es";
import { isUserAuthed } from "../../../utils/auth";
import { useManagePageGate } from "./useManagePageGate";

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
        <Input activeStyle='headerFilter'
            type="text"
            value={tmpValue}
            onChange={e => setTmpValue(e.target.value)}
            placeHolder={placeHolder}
        />
    );
};

// Manage-page chrome comes from `theme.auth.authPages.manage`; the fallbacks
// are the literals these pages carried before the keys existed.
const MANAGE_DEFAULTS = {
    pageWrapper: "flex flex-col gap-3",
    headerRow: "w-full flex justify-between border-b-2 border-blue-400",
    headerTitle: "text-2xl font-semibold text-gray-700",
    headerStats: "flex items-stretch gap-3",
    headerStatsItem: "",
    headerStatsValue: "text-xl font-semibold",
    headerStatsLabel: "text-xs text-gray-500",
    headerSubtitleSpacer: "text-sm",
    tableHeaderCell: "flex gap-3 items-center",
    metaText: "text-gray-500 text-sm",
    modalHeader: "flex items-center justify-between mb-2",
    modalTitle: "text-lg font-semibold text-gray-700",
    modalBody: "flex flex-row gap-3",
    notice: "",
    removeBody: "flex flex-col gap-3 text-sm text-left",
    removeList: "list-disc pl-5",
    removeWarning: "rounded-md px-3 py-2 bg-amber-50 text-amber-800",
};
const useManageTheme = () => {
    const { theme } = React.useContext(ThemeContext);
    return { ...MANAGE_DEFAULTS, ...(theme?.auth?.authPages?.manage || {}) };
};

function AddUserModal({ open, setOpen, onAdd, loading, status }) {
    const { UI } = React.useContext(ThemeContext);
    const { Modal, Input, Button, Icon } = UI;
    const m = useManageTheme();
    const [email, setEmail] = useState("");
    useEffect(() => { if (open) setEmail(""); }, [open]);

    return (
        <Modal open={open} setOpen={setOpen}>
            <div className={m.modalHeader}>
                <div className={m.modalTitle}>Add a user</div>
                <Button activeStyle="iconRow" aria-label="Close" onClick={() => setOpen(false)}>
                    <Icon icon="XMark" />
                </Button>
            </div>
            <div className={m.modalBody}>
                <Input
                    type="text"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeHolder="Enter user email"
                />
                <Button activeStyle='primary' disabled={loading} onClick={() => onAdd(email)}>
                    {loading ? "Adding" : status || "Add"}
                </Button>
            </div>
        </Modal>
    );
}

export default function UsersAdmin({ app = '', authPermissions = {}, emailTheme: authEmailTheme = {}, pgEnvs = [] }) {
    const [groups, setGroups] = useState([]);
    const [users, setUsers] = useState([]);
    const [requests, setRequests] = useState([]);
    const [searchUser, setSearchUser] = useState('');
    const [searchGroup, setSearchGroup] = useState('');
    const [searchRequest, setSearchRequest] = useState('');
    const [addingNew, setAddingNew] = useState(false);
    const [loadingAdd, setLoadingAdd] = useState(false);
    const [editUser, setEditUser] = useState(null);
    const [addStatus, setAddStatus] = useState('');
    const [resetStatus, setResetStatus] = useState('');
    // locks the reset button while the request is in flight and after it succeeds
    const [resetLocked, setResetLocked] = useState(false);
    // Remove from site: the user whose removal is being confirmed, and the server's dry-run plan
    const [removeUser, setRemoveUser] = useState(null);
    const [removePlan, setRemovePlan] = useState(null);
    const [removeStatus, setRemoveStatus] = useState('');
    const { UI } = React.useContext(ThemeContext);
    const { user, AUTH_HOST, PROJECT_NAME, baseUrl, viewAsUser, setViewAsUser } = React.useContext(AuthContext);
    const canViewAs = (user?.groups || []).some(g => g === `${app} Admin`)
      || isUserAuthed({ user, authPermissions, reqPermissions: ['view-as'] });
    const gridRef = useRef(null);
    const { Modal, Table, Button, Icon } = UI;
    const m = useManageTheme();
    // auth-users on the auth pattern (in-page; the route check doesn't block).
    const canManage = useManagePageGate('auth-users', authPermissions);

    // siteOrigin resolves a relative logoUrl server-side; logoTitle falls back like the login pages'
    const emailTheme = { ...authEmailTheme, logoTitle: authEmailTheme.logoTitle || PROJECT_NAME, siteOrigin: window.location.origin };

    const loadUsers = async () => {
        const uRes = await callAuthServer(`${AUTH_HOST}/users/byProject`, {
            token: user.token,
            project: PROJECT_NAME
        });
        if (!uRes.error) setUsers((uRes.users || []));
    };

    const handleAddUser = async (email) => {
        setLoadingAdd(true);
        setAddStatus('');
        const res = await callAuthServer(`${AUTH_HOST}/signup/assign/group`, {
            token: user.token,
            email,
            url: `${window.location.origin}${baseUrl}/login`,
            project: PROJECT_NAME,
            emailTheme
        });

        if(!res.error){
            await loadUsers();
            setAddingNew(false);
        }else{
            setAddStatus(res.error)
        }
        setLoadingAdd(false);
    };

    // Remove from site (dms-server /user/project/remove): the dry run fills the confirm dialog; the
    // server decides and strips the user's grants here, then their memberships. The account stays.
    const removeRequest = (row, extra = {}) => ({
        token: user.token, user_email: row.email, project: PROJECT_NAME, pgEnvs, ...extra,
    });
    const openRemove = async (row) => {
        setRemoveUser(row);
        setRemovePlan(null);
        setRemoveStatus('');
        const plan = await callAuthServer(`${AUTH_HOST}/user/project/remove`, removeRequest(row, { dryRun: true }));
        if (plan.error) setRemoveStatus(plan.error);
        else setRemovePlan(plan);
    };
    const confirmRemove = async () => {
        setRemoveStatus('removing');
        const res = await callAuthServer(`${AUTH_HOST}/user/project/remove`, removeRequest(removeUser));
        if (res.error) { setRemoveStatus(res.error); return; }
        setRemoveUser(null);
        await loadUsers();
    };

    /* ---------------------- Load Data (parallel) ---------------------- */
    useEffect(() => {
        if (!PROJECT_NAME || !canManage) return;

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
    }, [PROJECT_NAME, AUTH_HOST, user.token, user.email, canManage]);
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
        {name: 'email', display_name: 'User', show: true, type: 'text'},
        // `activeStyle: 'accent'` selects MultiSelect.theme.js's cobalt-accented
        // chip variant for this column only — the shared 'default' style (used
        // by every other multiselect in the app) is untouched.
        {name: 'groups', display_name: 'Groups', show: true, type: 'multiselect', options: groups.map(g => g.name), activeStyle: 'accent'},
        // `className` here is TableCell's own computed cell class (cellInner +
        // background + selection state) — a custom `type: 'ui'` Comp is handed
        // it like every other cell, but unlike `text`/`multiselect` columns
        // nothing applies it automatically, so it must be spread onto a
        // wrapping element or the column loses cellInner's padding entirely.
        {name: 'created_at', display_name: 'Created', show: true, type: 'ui',
            Comp: ({ row, className }) => <div className={className}><span className={m.metaText}>{fmtDate(row.created_at)}</span></div>},
        {name: 'last_login', display_name: 'Last Login', show: true, type: 'ui',
            Comp: ({ row, className }) => <div className={className}><span className={m.metaText}>{fmtDate(row.last_login)}</span></div>},
        {
            name: 'view_as', display_name: '', show: canViewAs, type: 'ui',
            Comp: ({ row, className }) => {
                const isActive = viewAsUser?.email === row.email;
                return (
                    <div className={className}>
                        <Button
                            activeStyle='small'
                            onClick={() => setViewAsUser(isActive ? null : { ...row, groups: [...new Set([...(row.groups || []), 'public'])], authed: true, isAuthenticating: false })}
                        >
                            {isActive ? 'Viewing As' : 'View As'}
                        </Button>
                    </div>
                );
            }
        },
        {
            name: '', display_name: '', show: true, type: 'ui',
            Comp: d => <div className={d.className}>{d.row.manageable !== false && <>
                <Button activeStyle='small' onClick={() => { setResetStatus(''); setResetLocked(false); setEditUser(d.row); }}>reset password</Button>
                <Button activeStyle='small' onClick={() => openRemove(d.row)}>remove from site</Button>
            </>}</div>
        },
    ];


    const usersTableControls = useMemo(() => ({
        header: {
            displayFn: (attribute) => (
                <div className={m.tableHeaderCell}>
                    {attribute.display_name}
                    { attribute.name === 'email' &&
                        <InputControl show value={searchUser} onChange={setSearchUser} placeHolder="search..."/> }
                    { attribute.name === 'groups' &&
                        <InputControl show value={searchGroup} onChange={setSearchGroup} placeHolder="filter group..."/> }
                </div>
            )
        }
    }), [searchUser, searchGroup, m.tableHeaderCell]);

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
    }, [users, searchUser, searchGroup]);

    // const filteredRequests = useMemo(() => {
    //     const sr = searchRequest.toLowerCase();
    //     return sr ? requests.filter(r => r.user_email.toLowerCase().includes(sr)) : requests;
    // }, [requests, searchRequest]);

    const customTableTheme = {
        tableContainer1: 'flex flex-col no-wrap min-h-[40px] max-h-[700px] overflow-y-auto'
    };

    /* -------------------------------- Render -------------------------------- */

    if (!user?.authed) return <div className={m.notice}>To access this page, you need to login.</div>;
    if (!canManage) return null;

    return (
        <>
            {/* Title flush on the page background — NOT inside pageWrapper's card, which
                wraps only the table below (matches design_system_v6/pages/admin-users.html's
                separate "users-header" and "users-table" sections; previously both lived
                inside pageWrapper, reading as one page-length white box). */}
            <div className={m.headerRow}>
                <div className="min-w-0">
                    <div className={m.headerTitle}>Users</div>
                    {/* Blank line under the title — mimics Sites' identityWrapper, whose title
                        always has a real second line (the site's domain, `identitySubtitle`)
                        giving its own title block roughly the same height as its boxed stats.
                        Users has nothing real to put there, but needs the same height so its
                        title vertically aligns with the boxed stats sitting next to it in this
                        row (without this, the stats box is taller than a bare one-line title,
                        so the row grows to fit it and the title sits visibly lower than every
                        other page's — flagged live, 2026-09-21). `aria-hidden` + non-breaking
                        space: decorative only, holds its own line-height, nothing to announce. */}
                    <p className={m.headerSubtitleSpacer} aria-hidden="true">&nbsp;</p>
                </div>
                <span className="flex-1" />
                <div className={m.headerStats}>
                    <div className={m.headerStatsItem}>
                        <p className={m.headerStatsValue}>{users.length}</p>
                        <p className={m.headerStatsLabel}>users</p>
                    </div>
                    <div className={m.headerStatsItem}>
                        <p className={m.headerStatsValue}>{groups.length}</p>
                        <p className={m.headerStatsLabel}>groups</p>
                    </div>
                </div>
                <Button activeStyle='primary' onClick={() => { setAddStatus(''); setAddingNew(true); }}>Add new</Button>
            </div>

            <div className={m.pageWrapper}>
            {/* <Table data={filteredRequests} columns={requestsColumns} controls={requestsTableControls} customTheme={customTableTheme} /> */}

            <Table
                gridRef={gridRef}
                data={filteredUsers}
                columns={userColumns}
                allowEdit={true}
                // The server marks users in groups this caller can't manage (/users/byProject `manageable`);
                // their rows are read-only here and the server refuses their writes anyway.
                canEdit={({ row }) => row?.manageable !== false}
                activeStyle="list"
                updateItem={async (_, __, e) => {
                    const original = users.find(u => u.email === e.email);

                    const added = e.groups.find(g => !(original.groups || []).includes(g));
                    const removed = original.groups?.find(g => !(e.groups || []).includes(g));

                    let res;
                    if (added) {
                        res = await callAuthServer(`${AUTH_HOST}/user/group/assign`, {
                            token: user.token,
                            user_email: original.email,
                            group_name: added,
                        });
                    }
                    if (removed && !res?.error) {
                        res = await callAuthServer(`${AUTH_HOST}/user/group/remove`, {
                            token: user.token,
                            user_email: original.email,
                            group_name: removed,
                        });
                    }
                    // Re-read either way: a refused change reverts, a saved one becomes the next diff's base.
                    if (res) await loadUsers();
                }}
                controls={usersTableControls}
            />
            </div>

            {/* Add user modal */}
            <AddUserModal
                open={addingNew}
                setOpen={setAddingNew}
                onAdd={handleAddUser}
                loading={loadingAdd}
                status={addStatus}
            />

            {/* Remove from site modal */}
            <Modal open={Boolean(removeUser)} setOpen={setRemoveUser}>
                <div className={m.modalHeader}>
                    <div className={m.modalTitle}>Remove from site</div>
                    <Button activeStyle="iconRow" aria-label="Close" onClick={() => setRemoveUser(null)}>
                        <Icon icon="XMark" />
                    </Button>
                </div>
                <div className={m.removeBody}>
                    <div>Remove {removeUser?.email} from {PROJECT_NAME}? Their account stays.</div>
                    {removePlan && <>
                        <div>Groups they leave: {removePlan.groups.join(', ')}</div>
                        {removePlan.sharedGroups.length > 0 &&
                            <div className={m.removeWarning}>
                                These groups are shared with other projects, so they lose that access too:
                                <ul className={m.removeList}>
                                    {removePlan.sharedGroups.map(s =>
                                        <li key={s.group}>{s.group}: {s.otherProjects.join(', ')}</li>)}
                                </ul>
                            </div>}
                        {removePlan.siteGrants.length > 0 &&
                            <div>Their own permissions on {removePlan.siteGrants.length} pattern, page or source row(s) here are removed.</div>}
                        {removePlan.externalSources.length > 0 &&
                            <div className={m.removeWarning}>
                                They keep their own permissions on these external sources (other sites may use them);
                                remove them from each source's Access tab:
                                <ul className={m.removeList}>
                                    {removePlan.externalSources.map(e =>
                                        <li key={`${e.pgEnv}-${e.source_id}`}>{e.name || e.source_id} ({e.pgEnv}{e.error ? `: ${e.error}` : ''})</li>)}
                                </ul>
                            </div>}
                    </>}
                    {removeStatus && <div className={m.metaText}>{removeStatus}</div>}
                    <div>
                        <Button activeStyle='primary' disabled={!removePlan || removeStatus === 'removing'} onClick={confirmRemove}>
                            Remove
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Reset password modal */}
            <Modal open={Boolean(editUser)} setOpen={setEditUser}>
                <div className={m.modalHeader}>
                    <div className={m.modalTitle}>Reset password</div>
                    <Button activeStyle="iconRow" aria-label="Close" onClick={() => setEditUser(null)}>
                        <Icon icon="XMark" />
                    </Button>
                </div>
                <div className={m.modalBody}>
                    Reset password for: {editUser?.email}?
                    <Button activeStyle='primary' disabled={resetLocked} onClick={async () => {
                        setResetLocked(true);
                        setResetStatus('sending');
                        const res = await callAuthServer(`${AUTH_HOST}/password/reset`, {
                            project_name: PROJECT_NAME,
                            email: editUser?.email,
                            host: `${window?.location?.host}`,
                            url: `${window.location.origin}${baseUrl}/login`,
                            emailTheme
                        });
                        setResetStatus(res.error || res.message);
                        if (res.error) setResetLocked(false);
                    }}>
                        {resetStatus || "reset"}
                    </Button>
                </div>
            </Modal>
        </>
    );
}
