import React from "react";
import { Link, useNavigate } from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";



export default (props) => {
    const [ credentials, setCredentials ] = React.useState({email: '', password: ''});
    const [status, setStatus] = React.useState('');
    const { theme, UI } = React.useContext(ThemeContext);
    const { user, PROJECT_NAME, AuthAPI, defaultRedirectUrl, baseUrl} = React.useContext(AuthContext);
    const { FieldSet, Button } = UI;
    const navigate = useNavigate();

    if(status) return <div>{status}</div>

    const sectionGroupTheme = theme?.auth?.authPages?.sectionGroup?.default || {};

    return (
        <div className={sectionGroupTheme.pageWrapper}>
            <div className={sectionGroupTheme.pageTitle}>Reset Password</div>

            <FieldSet
                components={[
                    {
                        type:'Input',
                        label: 'Email',
                        value: credentials.email,
                        onChange: (e) => {
                            setCredentials({...credentials, email: e.target.value})
                        }
                    }
                ]}
            />

            <Button
                type={'plain'}
                className={sectionGroupTheme.actionButton}
                onClick={async () => {
                await AuthAPI.callAuthServer(`/password/reset`,
                    {...credentials, token: user.token, project: PROJECT_NAME, host: `${window.location.host}`, url: `/${baseUrl}/login`})
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
            }}> <span className={sectionGroupTheme.actionText}>Reset</span> </Button>
        </div>
    )
}
