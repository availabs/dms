import React, {useEffect, useMemo, useRef, useState} from "react";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";
import {isEqual} from "lodash-es";
import { isUserAuthed } from "../../../utils/auth";

const InputControl = ({show, value, onChange, placeHolder, className}) => {
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
        <Input className={className}
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
    headerAction: "shrink-0",
    headerStats: "flex items-stretch gap-3",
    headerStatsItem: "",
    headerStatsValue: "text-xl font-semibold",
    headerStatsLabel: "text-xs text-gray-500",
    headerSubtitleSpacer: "text-sm",
    tableHeaderCell: "flex gap-3 items-center",
    metaText: "text-gray-500 text-sm",
    modalHeader: "flex items-center justify-between mb-2",
    modalTitle: "text-lg font-semibold text-gray-700",
    modalCloseBtn: "text-gray-400 hover:text-gray-700",
    modalBody: "flex flex-row gap-3",
    notice: "",
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
                <button type="button" aria-label="Close" className={m.modalCloseBtn} onClick={() => setOpen(false)}>
                    <Icon icon="XMark" />
                </button>
            </div>
            <div className={m.modalBody}>
                <Input
                    type="text"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeHolder="Enter user email"
                />
                <Button className={m.modalAction} disabled={loading} onClick={() => onAdd(email)}>
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
    const [addStatus, setAddStatus] = useState('');
    const [resetStatus, setResetStatus] = useState('');
    // locks the reset button while the request is in flight and after it succeeds
    const [resetLocked, setResetLocked] = useState(false);
    const { UI } = React.useContext(ThemeContext);
    const { user, AUTH_HOST, PROJECT_NAME, baseUrl, viewAsUser, setViewAsUser } = React.useContext(AuthContext);
    const canViewAs = (user?.groups || []).some(g => g === `${app} Admin`)
      || isUserAuthed({ user, authPermissions, reqPermissions: ['view-as'] });
    const gridRef = useRef(null);
    const { Modal, Table, Button, Icon } = UI;
    const m = useManageTheme();

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
            project: PROJECT_NAME
        });

        if(!res.error){
            await loadUsers();
            setAddingNew(false);
        }else{
            setAddStatus(res.error)
        }
        setLoadingAdd(false);
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
                            className={m.rowAction}
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
            Comp: d => <div className={d.className}><Button className={m.rowAction} onClick={() => { setResetStatus(''); setResetLocked(false); setEditUser(d.row); }}>reset password</Button></div>
        },
    ];


    const usersTableControls = useMemo(() => ({
        header: {
            displayFn: (attribute) => (
                <div className={m.tableHeaderCell}>
                    {attribute.display_name}
                    { attribute.name === 'email' &&
                        <InputControl show value={searchUser} onChange={setSearchUser} placeHolder="search..." className={m.headerInput}/> }
                    { attribute.name === 'groups' &&
                        <InputControl show value={searchGroup} onChange={setSearchGroup} placeHolder="filter group..." className={m.headerInput}/> }
                </div>
            )
        }
    }), [searchUser, searchGroup, m.tableHeaderCell, m.headerInput]);

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
                <Button className={m.headerAction} onClick={() => { setAddStatus(''); setAddingNew(true); }}>Add new</Button>
            </div>

            <div className={m.pageWrapper}>
            {/* <Table data={filteredRequests} columns={requestsColumns} controls={requestsTableControls} customTheme={customTableTheme} /> */}

            <Table
                gridRef={gridRef}
                data={filteredUsers}
                columns={userColumns}
                allowEdit={true}
                activeStyle="roomy"
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
            </div>

            {/* Add user modal */}
            <AddUserModal
                open={addingNew}
                setOpen={setAddingNew}
                onAdd={handleAddUser}
                loading={loadingAdd}
                status={addStatus}
            />

            {/* Reset password modal */}
            <Modal open={Boolean(editUser)} setOpen={setEditUser}>
                <div className={m.modalHeader}>
                    <div className={m.modalTitle}>Reset password</div>
                    <button type="button" aria-label="Close" className={m.modalCloseBtn} onClick={() => setEditUser(null)}>
                        <Icon icon="XMark" />
                    </button>
                </div>
                <div className={m.modalBody}>
                    Reset password for: {editUser?.email}?
                    <Button className={m.modalAction} disabled={resetLocked} onClick={async () => {
                        setResetLocked(true);
                        setResetStatus('sending');
                        const res = await callAuthServer(`${AUTH_HOST}/password/reset`, {
                            project_name: PROJECT_NAME,
                            email: editUser?.email,
                            host: `${window?.location?.host}`,
                            // absolute, like handleAddUser's: the server only prefixes a relative url with emailTheme.siteOrigin, which isn't sent here
                            url: `${window.location.origin}${baseUrl}/login`
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
