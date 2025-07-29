import React from "react";
import {Link, useNavigate, useLocation} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../siteConfig";
import {callAuthServer} from "../utils";


export default (props) => {
    const location = useLocation();
    const [credentials, setCredentials] = React.useState({email: '', password: ''});
    const [status, setStatus] = React.useState('');
    const {theme} = React.useContext(ThemeContext);
    const {UI, user, setUser, AUTH_HOST, PROJECT_NAME, defaultRedirectUrl, baseUrl, ...restAuthContext} = React.useContext(AuthContext);
    const {FieldSet, Button} = UI;
    const navigate = useNavigate();

    if(status) return <div>{status}</div>

    return (
        <div>
            Signup

            <FieldSet
                components={[
                    {
                        type:'Input',
                        label: 'Email',
                        value: credentials.email,
                        onChange: (e) => {
                            setCredentials({...credentials, email: e.target.value})
                        }
                    },
                    {
                        type:'Input',
                        input_type: 'password',
                        label: 'Password',
                        value: credentials.password,
                        onChange: (e) => {
                            setCredentials({...credentials, password: e.target.value})
                        }
                    },{
                        type:'Input',
                        input_type: 'password',
                        label: 'Verify Password',
                        value: credentials.verifyPassword,
                        onChange: (e) => {
                            setCredentials({...credentials, verifyPassword: e.target.value})
                        }
                    },
                ]}
            />

            <Button
                disabled={credentials.password !== credentials.verifyPassword}
                onClick={async () => {
                console.log('call signup', credentials, AUTH_HOST)
                await callAuthServer(`${AUTH_HOST}/signup/assign/group`,
                    {...credentials, project: PROJECT_NAME})
                    .then(res => {
                        console.log('res', res)
                        if (res.error) {
                            setStatus(res.error)
                            console.error('Error', res.error)
                        } else {
                            setStatus(res.message)
                            navigate(`${baseUrl}/login`)
                        }
                    })
                    .catch(error => {
                        setStatus('Cannot contact authentication server.')
                        console.error('Cannot contact authentication server.');
                    });
            }}> Signup </Button>

            <div>Already have an account? <Link to={`${baseUrl}/login`}>login</Link></div>
        </div>
    )
}