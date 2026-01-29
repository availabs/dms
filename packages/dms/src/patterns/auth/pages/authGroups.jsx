import React, {useEffect, useRef, useState} from "react";
import {useNavigate, useLocation} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";

export default (props) => {
    const location = useLocation();
    const [groups, setGroups] = React.useState([]);
    const [searchGroup, setSearchGroup] = React.useState('');
    const [addingNew, setAddingNew] = React.useState(false);
    const [status, setStatus] = React.useState('');
    const [newGroup, setNewGroup] = React.useState({name: ''});
    const {theme, UI } = React.useContext(ThemeContext);
    const { user, AUTH_HOST, PROJECT_NAME, AuthAPI, defaultRedirectUrl } = React.useContext(AuthContext);
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
        {name: 'name', display_name: 'Group', show: true, type: 'text'},
        {name: 'num_members', display_name: '# Members', show: true, type: 'text'},
    ]
    if(!user?.authed) return <div>To access this page, you need to login.</div>

    return (
        <div className={'flex flex-col gap-3'}>
            <div className={'w-full flex'}>
                <div className={'w-full flex justify-between border-b-2 border-blue-400'}>
                    <div className={'text-2xl font-semibold text-gray-700'}>Groups</div>
                </div>
                <Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add new </Button>
            </div>


                    <Table gridRef={gridRef}
                           data={groups.filter(r => !searchGroup || r.name.toLowerCase().includes(searchGroup))}
                           columns={groupColumns}
                           allowEdit={true}
                           controls={{header: {displayFn: (attribute) => (
                                       <div className={'flex gap-3 items-center'}>
                                           {attribute.display_name}
                                           {
                                               attribute.name === 'name' ?
                                                   <Input type={'text'} value={searchGroup} onChange={e => setSearchGroup(e.target.value)} placeHolder={'search...'}/> :
                                                   null
                                           }
                                       </div>
                                   )}}}
                           // customTheme={{tableContainer1: 'flex flex-col no-wrap min-h-[40px] max-h-[700px] overflow-y-auto'}}
                    />

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
        </div>
    )
}
