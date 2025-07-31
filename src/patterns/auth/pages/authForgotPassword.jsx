import React, {useEffect} from "react";
import {Link, useNavigate, useLocation} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../siteConfig";
import {callAuthServer} from "../utils";


export default (props) => {
    const [credentials, setCredentials] = React.useState({email: '', password: ''});
    const [status, setStatus] = React.useState('');
    const {theme} = React.useContext(ThemeContext);
    const {UI, user, setUser, AUTH_HOST, PROJECT_NAME, defaultRedirectUrl, baseUrl, ...restAuthContext} = React.useContext(AuthContext);
    const {FieldSet, Button} = UI;
    const navigate = useNavigate();

    if(status) return <div>{status}</div>

    return (
        <div className={'max-w-xs mx-auto my-auto flex flex-col gap-3'}>
            Forgot Password

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
                onClick={async () => {
                console.log('call password reset', credentials, AUTH_HOST)
                await callAuthServer(`${AUTH_HOST}/password/reset`,
                    {...credentials, token: user.token, project: PROJECT_NAME, host: `${window.location.host}`, url: `/${baseUrl}/login`})
                    .then(res => {
                        console.log('res', res)
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
            }}> Reset </Button>
        </div>
    )
}