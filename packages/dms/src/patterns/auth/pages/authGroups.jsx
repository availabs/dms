import React, {useEffect, useRef, useState} from "react";
import {useLocation} from "react-router";
import {ThemeContext, getComponentTheme} from "../../../ui/useTheme";
import {AuthContext} from "../context";

function inferPermLevel(name) {
  if (/admin/i.test(name)) return 'admin';
  if (/edit|steward|author/i.test(name)) return 'editor';
  if (/public/i.test(name)) return 'public';
  return 'viewer';
}

function isSystemGroup(name) {
  return /admin$/i.test(name) || name === 'public';
}

const LEVEL_DESCRIPTIONS = {
  admin:  'Full admin access · Site management',
  editor: 'Content editing · Dataset management',
  viewer: 'View restricted pages · Read-only',
  public: 'Public pages only · Anonymous access',
};

const PERM_CAPABILITIES = [
  { label: 'View public pages',             public: 'yes',     viewer: 'yes',     editor: 'yes',     admin: 'yes' },
  { label: 'View restricted pages',         public: 'no',      viewer: 'yes',     editor: 'yes',     admin: 'yes' },
  { label: 'Submit forms',                  public: 'partial', viewer: 'yes',     editor: 'yes',     admin: 'yes' },
  { label: 'Edit content (pages, sections)',public: 'no',      viewer: 'no',      editor: 'yes',     admin: 'yes' },
  { label: 'Manage datasets / queries',     public: 'no',      viewer: 'no',      editor: 'yes',     admin: 'yes' },
  { label: 'Manage sites, themes, patterns',public: 'no',      viewer: 'no',      editor: 'no',      admin: 'yes' },
  { label: 'Manage users and groups',       public: 'no',      viewer: 'no',      editor: 'no',      admin: 'yes' },
];

const CHECK_SVG = <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>;
const DASH_SVG  = <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M5 12h14"/></svg>;

function PermissionMatrix({ t }) {
  const levels = ['public', 'viewer', 'editor', 'admin'];
  return (
    <div className={t.permMatrixSection || 'mt-8 pt-6 border-t'}>
      <div className={t.permMatrixTitle || 'text-lg font-semibold mb-1'}>What each level can do.</div>
      <div className={t.permMatrixSubtitle || 'text-sm text-slate-500 mb-4'}>
        Permission levels are set per group when the group is created. The level governs what authenticated members can see and do across all sites that check group membership.
      </div>
      <table className={t.permMatrixTable || 'w-full border text-sm'}>
        <thead>
          <tr className={t.permMatrixHeaderRow || 'bg-gray-50 border-b'}>
            <th className={t.permMatrixHeaderFirst || 'px-4 py-3 text-left font-mono text-xs uppercase'}>Capability</th>
            {levels.map(level => (
              <th key={level} className={t.permMatrixHeaderCell || 'px-4 py-3 font-mono text-xs uppercase text-center'}>{level}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERM_CAPABILITIES.map((cap, i) => (
            <tr key={cap.label} className={i % 2 === 1 ? (t.permMatrixRowAlt || 'border-b bg-gray-50') : (t.permMatrixRow || 'border-b')}>
              <td className={t.permMatrixCapability || 'px-4 py-3 text-sm'}>{cap.label}</td>
              {levels.map(level => {
                const val = cap[level];
                return (
                  <td key={level} className={t.permMatrixCell || 'px-4 py-3 text-center'}>
                    {val === 'yes'     && <div className={t.permCheckYes     || 'mx-auto w-5 h-5 rounded-full bg-green-500 flex items-center justify-center'}>{CHECK_SVG}</div>}
                    {val === 'partial' && <div className={t.permCheckPartial || 'mx-auto w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center'}>{DASH_SVG}</div>}
                    {val === 'no'      && <div className={t.permCheckNo      || 'mx-auto w-5 h-5 rounded-full border bg-gray-100'} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AuthGroups (props) {
    useLocation();
    const [groups, setGroups] = React.useState([]);
    const [searchGroup, setSearchGroup] = React.useState('');
    const [addingNew, setAddingNew] = React.useState(false);
    const [status, setStatus] = React.useState('');
    const [newGroup, setNewGroup] = React.useState({name: ''});
    const {UI, theme: themeFromContext = {} } = React.useContext(ThemeContext);
    const t = getComponentTheme(themeFromContext, 'admin');
    const { user, AUTH_HOST, PROJECT_NAME, AuthAPI } = React.useContext(AuthContext);
    const gridRef = useRef(null);
    const {Table, Input, Modal, Button} = UI;

    useEffect(() => {
        async function loadGroups(){
            await AuthAPI.getGroups({ user }).then(res => {
                if(res.error){
                    console.error(res.error);
                }else{
                    setGroups(res.groups || [])
                }
            });
        }

        loadGroups();
    }, [PROJECT_NAME]);

    const groupColumns = [
        {name: 'name', display_name: 'Group', show: true, type: 'ui',
          Comp: ({ row }) => {
            const level = inferPermLevel(row.name);
            return (
              <div>
                <div className="flex items-center gap-2">
                  <span>{row.name}</span>
                  {isSystemGroup(row.name) && (
                    <span className={t.systemBadge || 'text-xs border px-1.5 text-slate-400'}>System</span>
                  )}
                </div>
                <div className={t.groupDescription || 'text-xs text-slate-400 mt-0.5'}>{LEVEL_DESCRIPTIONS[level]}</div>
              </div>
            );
          }
        },
        {name: 'perm_level', display_name: 'Permission', show: true, type: 'ui',
          Comp: ({ row }) => {
            const level = inferPermLevel(row.name);
            const variantKey = { admin: 'permBadgeAdmin', editor: 'permBadgeEditor', viewer: 'permBadgeViewer', public: 'permBadgePublic' }[level];
            return <span className={`${t.permBadge || ''} ${t[variantKey] || ''}`}>{level}</span>;
          }
        },
        {name: 'num_members', display_name: 'Members', show: true, type: 'text'},
    ];

    if(!user?.authed) return <div>To access this page, you need to login.</div>

    return (
        <div className={'flex flex-col gap-3'}>
            <div className={t.pageHeader || 'w-full flex justify-between border-b-2 border-blue-400'}>
                <div className={t.pageTitle || 'text-2xl font-semibold text-gray-700'}>Groups</div>
                <Button className={'shrink-0'} onClick={() => setAddingNew(true)}>Create group</Button>
            </div>

            <Table gridRef={gridRef}
                   data={groups.filter(r => !searchGroup || r.name.toLowerCase().includes(searchGroup))}
                   columns={groupColumns}
                   allowEdit={true}
                   controls={{header: {displayFn: (attribute) => (
                       <div className={'flex gap-3 items-center'}>
                           {attribute.display_name}
                           {attribute.name === 'name' &&
                               <Input type={'text'} value={searchGroup} onChange={e => setSearchGroup(e.target.value)} placeHolder={'search...'}/> }
                       </div>
                   )}}}
            />

            <PermissionMatrix t={t} />

            <Modal open={addingNew} setOpen={setAddingNew}>
                <div className={'flex flex-row gap-3'}>
                    <Input type={'text'}
                           value={newGroup.name}
                           onChange={e => setNewGroup({...newGroup, name: e.target.value})}
                           placeHolder={'Please enter Group Name'}
                    />
                    <Button onClick={async () => {
                        setStatus('Adding');
                        await AuthAPI.callAuthServer(`/group/create/project/assign`,
                            {
                                token: user.token,
                                group_name: newGroup.name,
                                project_name: PROJECT_NAME,
                                auth_level: 0
                            })
                            .then(res => {
                                if (res.error) {
                                    setStatus(res.error)
                                } else {
                                    setStatus('')
                                }
                            })
                            .catch(error => {
                                console.error('Cannot contact authentication server.');
                            });
                        setNewGroup({name: ''})
                        setStatus('');
                    }}>{status || 'Add'}</Button>
                </div>
            </Modal>
        </div>
    )
}
