import React from "react";
import {Link, useNavigate, useLocation} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";


export default function AuthSignup ({ disableSignup, ...props }) {
    const location = useLocation();
    const [credentials, setCredentials] = React.useState({email: '', password: ''});
    const [status, setStatus] = React.useState('');
    const {theme, UI} = React.useContext(ThemeContext);
    const {user, setUser, AUTH_HOST, PROJECT_NAME, defaultRedirectUrl, baseUrl, ...restAuthContext} = React.useContext(AuthContext);
    const {FieldSet, Button} = UI;
    const navigate = useNavigate();

    const sectionGroupTheme = theme?.auth?.authPages?.sectionGroup?.default || {};

    if (disableSignup) {
        return (
            <div className={sectionGroupTheme.pageWrapper}>
                <div className={sectionGroupTheme.pageTitle}>Sign Up Disabled</div>
                <p className='text-sm text-gray-500'>Sign up is not available. Please contact an administrator.</p>
            </div>
        );
    }

    if(status) return <div>{status}</div>
    return (
        <div className={sectionGroupTheme.pageWrapper}>
            <div className={sectionGroupTheme.pageTitle}>Sign Up</div>

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
                className={sectionGroupTheme.actionButton}
                disabled={credentials.password !== credentials.verifyPassword}
                onClick={async () => {
                const emailTheme = {
                    ...(theme?.auth?.emailTheme || {}),
                    logoUrl:    theme?.logo?.img   || '',
                    logoTitle:  theme?.logo?.title || PROJECT_NAME,
                    siteOrigin: window.location.origin,
                };
                await callAuthServer(`${AUTH_HOST}/signup/assign/group`,
                    {...credentials, project: PROJECT_NAME, emailTheme})
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
                <span className={sectionGroupTheme.actionText}>Sign up</span>
            </Button>

            <div className={sectionGroupTheme.prompt}>
                Already have an account? <span><Link to={`${baseUrl}/login`} className={sectionGroupTheme.forgotPasswordText}>Sign in</Link></span></div>
        </div>
    )
}
