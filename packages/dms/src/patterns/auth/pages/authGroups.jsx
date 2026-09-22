import React, {useEffect, useRef, useState} from "react";
import {useNavigate, useLocation} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";

export default function AuthGroups (props) {
    const location = useLocation();
    const [groups, setGroups] = React.useState([]);
    const [searchGroup, setSearchGroup] = React.useState('');
    const [addingNew, setAddingNew] = React.useState(false);
    const [status, setStatus] = React.useState('');
    const [newGroup, setNewGroup] = React.useState({name: ''});
    const {theme, UI } = React.useContext(ThemeContext);
    const { user, AUTH_HOST, PROJECT_NAME, AuthAPI, defaultRedirectUrl } = React.useContext(AuthContext);
    const gridRef = useRef(null);
    const {Table, Input, Modal, Button, Icon} = UI;
    // Manage-page chrome from `theme.auth.authPages.manage`; fallbacks are the
    // literals this page carried before the keys existed.
    const m = {
        pageWrapper: "flex flex-col gap-3",
        headerOuter: "w-full flex",
        headerRow: "w-full flex justify-between border-b-2 border-blue-400",
        headerTitle: "text-2xl font-semibold text-gray-700",
        headerAction: "shrink-0",
        tableHeaderCell: "flex gap-3 items-center",
        modalHeader: "flex items-center justify-between mb-2",
        modalTitle: "text-lg font-semibold text-gray-700",
        modalCloseBtn: "text-gray-400 hover:text-gray-700",
        modalBody: "flex flex-row gap-3",
        notice: "",
        rowAction: undefined, modalAction: undefined, headerInput: undefined,
        ...(theme?.auth?.authPages?.manage || {}),
    };

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
        {name: 'name', display_name: 'Group', show: true, type: 'text'},
        {name: 'num_members', display_name: '# Members', show: true, type: 'text'},
    ]
    if(!user?.authed) return <div className={m.notice}>To access this page, you need to login.</div>

    return (
        <>
            {/* Title flush on the page background — NOT inside pageWrapper's card, which
                wraps only the table below (same fix as authUsers.jsx). */}
            <div className={m.headerOuter}>
                <div className={m.headerTitle}>Groups</div>
                <span className="flex-1" />
                <Button className={m.headerAction} onClick={() => setAddingNew(true)}>Add new</Button>
            </div>

            <div className={m.pageWrapper}>
                    <Table gridRef={gridRef}
                           data={groups.filter(r => !searchGroup || r.name.toLowerCase().includes(searchGroup))}
                           columns={groupColumns}
                           allowEdit={true}
                           activeStyle="roomy"
                           controls={{header: {displayFn: (attribute) => (
                                       <div className={m.tableHeaderCell}>
                                           {attribute.display_name}
                                           {
                                               attribute.name === 'name' ?
                                                   <Input type={'text'} className={m.headerInput} value={searchGroup} onChange={e => setSearchGroup(e.target.value)} placeHolder={'search...'}/> :
                                                   null
                                           }
                                       </div>
                                   )}}}
                           // customTheme={{tableContainer1: 'flex flex-col no-wrap min-h-[40px] max-h-[700px] overflow-y-auto'}}
                    />
            </div>

            <Modal open={addingNew} setOpen={setAddingNew}>
                <div className={m.modalHeader}>
                    <div className={m.modalTitle}>Add a group</div>
                    <button type="button" aria-label="Close" className={m.modalCloseBtn} onClick={() => setAddingNew(false)}>
                        <Icon icon="XMark" />
                    </button>
                </div>
                <div className={m.modalBody}>
                    <Input type={'text'}
                           value={newGroup.name}
                           onChange={e => setNewGroup({...newGroup, name: e.target.value})}
                           placeHolder={'Please enter Group Name'}
                    />
                    <Button className={m.modalAction} onClick={async () => {
                        setStatus('Adding');
                        await AuthAPI.callAuthServer(`/group/create/project/assign`,
                            {
                                token: user.token,
                                group_name: newGroup.name,
                                project_name: PROJECT_NAME,
                                auth_level: 0
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
                        setNewGroup({name: ''})
                        setStatus('');
                    }}>{status || 'Add'}</Button>
                </div>
            </Modal>
        </>
    )
}
