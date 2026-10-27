import React, {useEffect, useRef} from "react";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";
import { useManagePageGate } from "./useManagePageGate";

export default function AuthGroups ({ authPermissions = {}, pgEnvs = [] }) {
    const [groups, setGroups] = React.useState([]);
    const [searchGroup, setSearchGroup] = React.useState('');
    const [addingNew, setAddingNew] = React.useState(false);
    const [status, setStatus] = React.useState('');
    const [newGroup, setNewGroup] = React.useState({name: ''});
    // Remove from site: the group being confirmed and the server's dry-run plan (/group/delete)
    const [removeGroup, setRemoveGroup] = React.useState(null);
    const [removePlan, setRemovePlan] = React.useState(null);
    const [removeStatus, setRemoveStatus] = React.useState('');
    // Add external group: groups that exist but aren't on this site (/groups/linkable)
    const [linking, setLinking] = React.useState(false);
    const [linkable, setLinkable] = React.useState(null);
    const [searchLink, setSearchLink] = React.useState('');
    const [linkStatus, setLinkStatus] = React.useState('');
    const {theme, UI } = React.useContext(ThemeContext);
    const { user, AUTH_HOST, PROJECT_NAME, AuthAPI } = React.useContext(AuthContext);
    const gridRef = useRef(null);
    // auth-groups on the auth pattern (in-page; the route check doesn't block).
    const canManage = useManagePageGate('auth-groups', authPermissions);
    const {Table, Input, Modal, Button, Icon} = UI;
    // Manage-page chrome from `theme.auth.authPages.manage`; fallbacks are the
    // literals this page carried before the keys existed.
    const m = {
        pageWrapper: "flex flex-col gap-3",
        headerOuter: "w-full flex",
        headerRow: "w-full flex justify-between border-b-2 border-blue-400",
        headerTitle: "text-2xl font-semibold text-gray-700",
        headerActions: "flex items-center gap-2",
        tableHeaderCell: "flex gap-3 items-center",
        metaText: "text-gray-500 text-sm",
        modalHeader: "flex items-center justify-between mb-2",
        modalTitle: "text-lg font-semibold text-gray-700",
        modalBody: "flex flex-row gap-3",
        notice: "",
        removeBody: "flex flex-col gap-3 text-sm text-left",
        removeList: "list-disc pl-5",
        removeWarning: "rounded-md px-3 py-2 bg-amber-50 text-amber-800",
        linkList: "flex flex-col max-h-80 overflow-y-auto",
        linkRow: "flex items-center justify-between gap-3 py-1",
        linkName: "text-sm",
        ...(theme?.auth?.authPages?.manage || {}),
    };

    const loadGroups = async () => {
        const res = await AuthAPI.getGroups({ user });
        if (res.error) console.error(res.error);
        else setGroups(res.groups || []);
    };

    useEffect(() => {
        if (!canManage) return;
        loadGroups();
    }, [PROJECT_NAME, canManage]);

    // Remove from site (owner 2026-10-25): the server strips the group's grants here, unlinks it, and
    // deletes it once no other site uses it. No plan is fetched: a `dryRun` flag on /group/delete deletes on a
    // server that doesn't know it (owner 2026-10-27); a read-only plan route is task destructive-call-plan-routes.
    const removeRequest = (name, extra = {}) => ({ token: user.token, name, project: PROJECT_NAME, pgEnvs, ...extra });
    const openRemove = (row) => {
        setRemoveGroup(row);
        setRemovePlan(null);
        setRemoveStatus('');
    };
    const confirmRemove = async () => {
        setRemoveStatus('removing');
        const res = await callAuthServer(`${AUTH_HOST}/group/delete`, removeRequest(removeGroup.name));
        if (res.error) { setRemoveStatus(res.error); return; }
        setRemoveGroup(null);
        await loadGroups();
    };

    const openLink = async () => {
        setLinking(true);
        setLinkable(null);
        setSearchLink('');
        setLinkStatus('');
        const res = await callAuthServer(`${AUTH_HOST}/groups/linkable`, { token: user.token, project: PROJECT_NAME });
        if (res.error) setLinkStatus(res.error);
        else setLinkable(res.groups || []);
    };
    const linkGroup = async (name) => {
        setLinkStatus(`adding ${name}`);
        const res = await callAuthServer(`${AUTH_HOST}/group/project/assign`, {
            token: user.token, group_name: name, project_name: PROJECT_NAME,
        });
        if (res.error) { setLinkStatus(res.error); return; }
        setLinking(false);
        await loadGroups();
    };

    const groupColumns = [
        {name: 'name', display_name: 'Group', show: true, type: 'text'},
        {name: 'num_members', display_name: '# Members', show: true, type: 'text'},
        {
            name: '', display_name: '', show: true, type: 'ui',
            // The server marks groups this caller may manage (/groups/byproject `manageable`): protected
            // ones (the site's Admin, holders of *) have no action.
            Comp: d => <div className={d.className}>{d.row.name !== 'public' && d.row.manageable !== false &&
                <Button activeStyle='small' onClick={() => openRemove(d.row)}>remove from site</Button>}</div>
        },
    ]
    const filteredLinkable = (linkable || []).filter(g => !searchLink || g.name.toLowerCase().includes(searchLink.toLowerCase()));

    if(!user?.authed) return <div className={m.notice}>To access this page, you need to login.</div>
    if (!canManage) return null;

    return (
        <>
            {/* Title flush on the page background — NOT inside pageWrapper's card, which
                wraps only the table below (same fix as authUsers.jsx). */}
            <div className={m.headerOuter}>
                <div className={m.headerTitle}>Groups</div>
                <span className="flex-1" />
                <div className={m.headerActions}>
                    <Button activeStyle='action' onClick={openLink}>Add external group</Button>
                    <Button activeStyle='primary' onClick={() => setAddingNew(true)}>Add new</Button>
                </div>
            </div>

            <div className={m.pageWrapper}>
                    <Table gridRef={gridRef}
                           data={groups.filter(r => !searchGroup || r.name.toLowerCase().includes(searchGroup))}
                           columns={groupColumns}
                           allowEdit={false}
                           activeStyle="list"
                           controls={{header: {displayFn: (attribute) => (
                                       <div className={m.tableHeaderCell}>
                                           {attribute.display_name}
                                           {
                                               attribute.name === 'name' ?
                                                   <Input type={'text'} activeStyle='headerFilter' value={searchGroup} onChange={e => setSearchGroup(e.target.value)} placeHolder={'search...'}/> :
                                                   null
                                           }
                                       </div>
                                   )}}}
                    />
            </div>

            <Modal open={addingNew} setOpen={setAddingNew}>
                <div className={m.modalHeader}>
                    <div className={m.modalTitle}>Add a group</div>
                    <Button activeStyle="iconRow" aria-label="Close" onClick={() => setAddingNew(false)}>
                        <Icon icon="XMark" />
                    </Button>
                </div>
                <div className={m.modalBody}>
                    <Input type={'text'}
                           value={newGroup.name}
                           onChange={e => setNewGroup({...newGroup, name: e.target.value})}
                           placeHolder={'Please enter Group Name'}
                    />
                    <Button activeStyle='primary' onClick={async () => {
                        setStatus('Adding');
                        // A new group gets no access until a pattern's Access tab grants it something
                        // (the server creates it at level 0 on the permission path).
                        const res = await callAuthServer(`${AUTH_HOST}/group/create/project/assign`, {
                            token: user.token,
                            group_name: newGroup.name,
                            project_name: PROJECT_NAME,
                        }).catch(() => ({ error: 'Cannot contact authentication server.' }));
                        if (res.error) { setStatus(res.error); return; }
                        setStatus('');
                        setNewGroup({name: ''});
                        setAddingNew(false);
                        await loadGroups();
                    }}>{status || 'Add'}</Button>
                </div>
            </Modal>

            {/* Add external group: link a group that already exists (another site's, say) */}
            <Modal open={linking} setOpen={setLinking}>
                <div className={m.modalHeader}>
                    <div className={m.modalTitle}>Add external group</div>
                    <Button activeStyle="iconRow" aria-label="Close" onClick={() => setLinking(false)}>
                        <Icon icon="XMark" />
                    </Button>
                </div>
                <div className={m.removeBody}>
                    <div>Links an existing group to {PROJECT_NAME}. It gets no access here until a pattern&apos;s Access tab grants it something.</div>
                    <Input type={'text'} activeStyle='headerFilter' value={searchLink} onChange={e => setSearchLink(e.target.value)} placeHolder={'search groups...'}/>
                    {linkable && <div className={m.linkList}>
                        {filteredLinkable.length === 0 && <div className={m.metaText}>No groups match.</div>}
                        {filteredLinkable.map(g =>
                            <div key={g.name} className={m.linkRow}>
                                <span className={m.linkName}>{g.name} <span className={m.metaText}>{g.num_members} member{g.num_members === 1 ? '' : 's'}</span></span>
                                <Button activeStyle='small' onClick={() => linkGroup(g.name)}>add</Button>
                            </div>)}
                    </div>}
                    {linkStatus && <div className={m.metaText}>{linkStatus}</div>}
                </div>
            </Modal>

            {/* Remove from site */}
            <Modal open={Boolean(removeGroup)} setOpen={setRemoveGroup}>
                <div className={m.modalHeader}>
                    <div className={m.modalTitle}>Remove from site</div>
                    <Button activeStyle="iconRow" aria-label="Close" onClick={() => setRemoveGroup(null)}>
                        <Icon icon="XMark" />
                    </Button>
                </div>
                <div className={m.removeBody}>
                    <div>Remove {removeGroup?.name} from {PROJECT_NAME}?</div>
                    {!removePlan && <div>Its members lose the access it gives here, and its permissions on this
                        site&apos;s patterns, pages and sources are removed. If no other site uses it, the group is
                        deleted.</div>}
                    {removePlan && <>
                        {removePlan.members > 0 &&
                            <div>Its {removePlan.members} member{removePlan.members === 1 ? '' : 's'} lose the access it gives here.</div>}
                        {removePlan.siteGrants?.length > 0 &&
                            <div>Its permissions on {removePlan.siteGrants.length} pattern, page or source row(s) here are removed.</div>}
                        {removePlan.otherProjects?.length > 0 &&
                            <div>It stays in {removePlan.otherProjects.join(', ')}, with its members.</div>}
                        {removePlan.deletes && <div>No other site uses it, so the group is deleted.</div>}
                        {removePlan.projects?.length > 0 &&
                            <div className={m.removeWarning}>It is removed from every project where your level allows: {removePlan.projects.join(', ')}.</div>}
                        {removePlan.skippedGrants?.length > 0 &&
                            <div className={m.removeWarning}>
                                These rows name it in permissions that aren&apos;t in the expected format, so they are left
                                unchanged; fix them in each row&apos;s Access editor:
                                <ul className={m.removeList}>
                                    {removePlan.skippedGrants.map(s =>
                                        <li key={s.id}>{s.type} #{s.id}: {s.reason}</li>)}
                                </ul>
                            </div>}
                        {removePlan.externalSources?.length > 0 &&
                            <div className={m.removeWarning}>
                                It keeps its permissions on these external sources (other sites may use them); remove them
                                from each source&apos;s Access tab:
                                <ul className={m.removeList}>
                                    {removePlan.externalSources.map(e =>
                                        <li key={`${e.pgEnv}-${e.source_id}`}>{e.name || e.source_id} ({e.pgEnv}{e.error ? `: ${e.error}` : ''})</li>)}
                                </ul>
                            </div>}
                    </>}
                    {removeStatus && <div className={m.metaText}>{removeStatus}</div>}
                    <div>
                        <Button activeStyle='primary' disabled={removeStatus === 'removing'} onClick={confirmRemove}>
                            Remove
                        </Button>
                    </div>
                </div>
            </Modal>
        </>
    )
}
