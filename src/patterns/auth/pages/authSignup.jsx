import React from "react";
import {Link, useNavigate, useLocation} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";


export default (props) => {
    const location = useLocation();
    const [credentials, setCredentials] = React.useState({email: '', password: ''});
    const [status, setStatus] = React.useState('');
    const {theme, UI} = React.useContext(ThemeContext);
    const {user, setUser, AUTH_HOST, PROJECT_NAME, defaultRedirectUrl, baseUrl, ...restAuthContext} = React.useContext(AuthContext);
    const {FieldSet, Button} = UI;
    const navigate = useNavigate();

    if(status) return <div>{status}</div>

    return (
        <div className={'max-w-sm mx-auto my-auto flex flex-col gap-3'}>
            <div className={'border-b w-full'}>
                <div className={theme?.loginPage?.titleWrapper}>{theme?.loginPage?.titleText}</div>
                <div className={theme?.dataCard?.header}>Signup</div>
            </div>

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
                type={'plain'}
                className={`${theme?.signupButton}`}
                disabled={credentials.password !== credentials.verifyPassword}
                onClick={async () => {
                await callAuthServer(`${AUTH_HOST}/signup/assign/group`,
                    {...credentials, project: PROJECT_NAME})
                    .then(res => {
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
            }}>
                <span className={`text-sm ${theme?.dataCard?.value}`}> signup </span>
            </Button>

            <div className={`text-sm ${theme?.dataCard?.value}`}>Already have an account? <Link to={`${baseUrl}/login`} className={'underline'}>login</Link></div>
        </div>
    )
}
