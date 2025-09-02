import React, {useEffect, useState} from "react";
import {useNavigate, useLocation} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../siteConfig";
import {callAuthServer, getGroups} from "../utils";

export default (props) => {
    const location = useLocation();
    const [groups, setGroups] = React.useState([]);
    const [searchGroup, setSearchGroup] = React.useState('');
    const [addingNew, setAddingNew] = React.useState(false);
    const [status, setStatus] = React.useState('');
    const [newGroup, setNewGroup] = React.useState({name: ''});
    const {theme} = React.useContext(ThemeContext);
    const {UI, user, AUTH_HOST, PROJECT_NAME, defaultRedirectUrl, ...restAuthContext} = React.useContext(AuthContext);
    const {Table, Input, Modal, Button} = UI;

    useEffect(() => {
        async function loadGroups(){
            await getGroups({user, AUTH_HOST, PROJECT_NAME}).then(res => {
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
        {name: 'name', display_name: 'Group', show: true, type: 'text', size: 900},
        {name: 'num_members', display_name: '# Members', show: true, type: 'text', size: 600},
    ]
    console.log('data', groups)
    return (
        <div className={'flex flex-col gap-3'}>
            <div className={'w-full flex'}>
                <div className={'flex-1'}>
                    Manage Groups
                </div>
                <Button className={'shrink-0'} onClick={() => setAddingNew(true)}> Add new </Button>
            </div>


            <div className={'border rounded-md p-2'}>
                    <Table data={groups.filter(r => !searchGroup || r.name.toLowerCase().includes(searchGroup))}
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
                           customTheme={{tableContainer1: 'flex flex-col no-wrap min-h-[40px] max-h-[700px] overflow-y-auto'}}
                    />
            </div>

            <Modal open={addingNew} setOpen={setAddingNew}>
                <div className={'flex flex-row gap-3'}>
                    <Input type={'text'}
                           value={newGroup.name}
                           onChange={e => setNewGroup({...newGroup, name: e.target.value})}
                           placeHolder={'Please enter Group Name'}
                    />
                    <Button onClick={async () => {
                        setStatus('Adding');
                        await callAuthServer(`${AUTH_HOST}/group/create/project/assign`,
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