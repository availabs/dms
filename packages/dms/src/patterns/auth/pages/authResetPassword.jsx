import React, {useEffect} from "react";
import {Link, useNavigate, useLocation} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";


export default function AuthResetPassword (props) {
    const [credentials, setCredentials] = React.useState({email: '', password: ''});
    const [status, setStatus] = React.useState('');
    const {theme, UI} = React.useContext(ThemeContext);
    const { user, setUser, AUTH_HOST, PROJECT_NAME, defaultRedirectUrl, baseUrl, ...restAuthContext} = React.useContext(AuthContext);
    const {FieldSet, Button, Icon} = UI;
    const navigate = useNavigate();

    useEffect(() => {
        if(!user.authed) navigate(`${baseUrl}/login`, {state: {from: window.location.pathname}})
    }, [user]);

    const sectionGroupTheme = theme?.auth?.authPages?.sectionGroup?.default || {};

    // Previously a bare unstyled <div> — no pageWrapper, so the status
    // message rendered with no background/border/padding at all (looked
    // "transparent" against the page instead of a card).
    if(status) return <div className={sectionGroupTheme.pageWrapper}>{status}</div>
    return (
        <div className={sectionGroupTheme.pageWrapper}>
            {sectionGroupTheme.iconMarkWrapper && (
              <span className={sectionGroupTheme.iconMarkWrapper}>
                <Icon icon="Tile" className={sectionGroupTheme.iconMark} />
              </span>
            )}
            <div className={sectionGroupTheme.pageTitle}>Reset password</div>

            <FieldSet
                components={[
                    {
                        type:'Input',
                        label: 'email',
                        value: credentials.email,
                        onChange: (e) => {
                            setCredentials({...credentials, email: e.target.value})
                        }
                    },
                    {
                        type:'Input',
                        input_type: 'password',
                        label: 'current password',
                        value: credentials.current,
                        onChange: (e) => {
                            setCredentials({...credentials, current: e.target.value})
                        }
                    },
                    {
                        type:'Input',
                        input_type: 'password',
                        label: 'new password',
                        value: credentials.password,
                        onChange: (e) => {
                            setCredentials({...credentials, password: e.target.value})
                        }
                    },
                    {
                        type:'Input',
                        input_type: 'password',
                        label: 'verify new password',
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
                    logoUrl:    theme?.auth?.emailTheme?.logoUrl || theme?.logo?.img || '', // a theme's email logo beats the (possibly relative) site logo
                    logoTitle:  theme?.logo?.title || PROJECT_NAME,
                    siteOrigin: window.location.origin,
                };
                await callAuthServer(`${AUTH_HOST}/password/update`,
                    {...credentials, token: user.token, project: PROJECT_NAME, emailTheme})
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
            }}> <span className={sectionGroupTheme.actionText}>reset</span> </Button>
        </div>
    )
}
