import React, {useState} from "react";
import {useNavigate, useLocation, Link} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";


export default function AuthLogin (props) {
    const location = useLocation();
    const [credentials, setCredentials] = React.useState({email: '', password: ''});
    const [error, setError] = useState('');
    const { theme, UI } = React.useContext(ThemeContext);
    const { baseUrl, setUser, PROJECT_NAME, AuthAPI, defaultRedirectUrl } = React.useContext(AuthContext);
    const { FieldSet, Button } = UI;
    const navigate = useNavigate();
    // console.log('auth context aapi', AuthAPI)

    const sectionGroupTheme = theme?.auth?.authPages?.sectionGroup?.default || {};
    return (
        <div className={sectionGroupTheme.pageWrapper}>
            <div className={sectionGroupTheme.pageTitle}>Sign In</div>
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
            <Link to={`${baseUrl}/password/forgot`} className={`text-sm ${sectionGroupTheme.forgotPasswordText}`}>Forgot Password?</Link>

            {
                error ? <div className={'text-red-500 bg-red-50 rounded-md px-2 py-1'}>{error}</div> : null
            }
            <Button type={'plain'}
                    className={sectionGroupTheme.actionButton}
                    onClick={async () => {
                        await AuthAPI.callAuthServer(`/login`, {...credentials, project: PROJECT_NAME})
                            .then(res => {
                                if (res.error) {
                                    setError(res.error)
                                    console.error('Error', res.error)
                                } else {
                                    if (window.localStorage) {
                                        window.localStorage.setItem('userToken', res?.user?.token);
                                    }
                                    setUser({ ...res.user, groups: [...(res.user.groups || []), 'public'], authed: true, isAuthenticating: false })
                                    navigate(location?.state?.from || defaultRedirectUrl);
                                }
                            })
                            .catch(error => {
                                console.error('Cannot contact authentication server.', error);
                            });
                    }}
            > <span className={sectionGroupTheme.actionText}>Sign In</span> </Button>
            <div className={sectionGroupTheme.prompt}>
              Don't have an account?
              <span className={sectionGroupTheme.forgotPasswordText}><Link to={`${baseUrl}/signup`}>Sign up</Link></span>
            </div>

        </div>
    )
}
