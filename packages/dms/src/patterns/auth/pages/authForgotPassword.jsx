import React from "react";
import { Link, useNavigate } from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";



export default function AuthForgotPassword (props) {
    const [ credentials, setCredentials ] = React.useState({email: '', password: ''});
    const [status, setStatus] = React.useState('');
    const { theme, UI } = React.useContext(ThemeContext);
    const { user, PROJECT_NAME, AuthAPI, defaultRedirectUrl, baseUrl} = React.useContext(AuthContext);
    const { FieldSet, Button, Icon } = UI;
    const navigate = useNavigate();

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
                    }
                ]}
            />

            <Button
                type={'plain'}
                className={sectionGroupTheme.actionButton}
                onClick={async () => {
                const emailTheme = {
                    ...(theme?.auth?.emailTheme || {}),
                    logoUrl:    theme?.logo?.img   || '',
                    logoTitle:  theme?.logo?.title || PROJECT_NAME,
                    siteOrigin: window.location.origin,
                };
                await AuthAPI.callAuthServer(`/password/reset`,
                    {...credentials, token: user.token, project: PROJECT_NAME,
                     host: `${window.location.host}`, url: `${baseUrl}/login`, emailTheme})
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
            }}> <span className={sectionGroupTheme.actionText}>reset</span> </Button>
        </div>
    )
}
