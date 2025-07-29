import React from "react";
import {useNavigate, useLocation} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../siteConfig";
import {callAuthServer} from "../utils";
import {API_HOST} from "~/config";


export default (props) => {
    const location = useLocation();
    const [credentials, setCredentials] = React.useState({email: '', password: ''});
    const {theme} = React.useContext(ThemeContext);
    const {UI, user, setUser, AUTH_HOST, PROJECT_NAME, defaultRedirectUrl, ...restAuthContext} = React.useContext(AuthContext);
    const {FieldSet, Button} = UI;
    const navigate = useNavigate();

    return (
        <div>
            Login

            <FieldSet
                components={[
                    {
                        type:'Input',
                        label: 'Email',
                        value: credentials.email,
                        onChange: (e) => {
                            setCredentials({...credentials, email: e.target.value})
                        }
                    },{
                        type:'Input',
                        input_type: 'password',
                        label: 'Password',
                        value: credentials.password,
                        onChange: (e) => {
                            setCredentials({...credentials, password: e.target.value})
                        }
                    },
                ]}
            />

            <Button onClick={async () => {
                console.log('call login', credentials, AUTH_HOST)
                await callAuthServer(`${AUTH_HOST}/login`, {...credentials, project: PROJECT_NAME})
                    .then(res => {
                        console.log('res', res)
                        if (res.error) {
                            console.error('Error', res.error)
                        } else {
                            if (window.localStorage) {
                                window.localStorage.setItem('userToken', res?.user?.token);
                            }
                            setUser({...res.user, isAuthenticating: false, authed: true})
                            window.location = location?.state?.from || defaultRedirectUrl;
                        }
                    })
                    .catch(error => {
                        console.error('Cannot contact authentication server.');
                    });
            }}> Login </Button>
        </div>
    )
}