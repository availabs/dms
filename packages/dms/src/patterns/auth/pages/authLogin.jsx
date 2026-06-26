import React, {useState} from "react";
import {useNavigate, useLocation, Link} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import {callAuthServer} from "../api";


export default function AuthLogin ({ disableSignup, ...props }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [credentials, setCredentials] = React.useState({email: '', password: ''});
    const [error, setError] = useState('');
    const { theme, UI } = React.useContext(ThemeContext);
    const { baseUrl, setUser, PROJECT_NAME, AuthAPI, defaultRedirectUrl } = React.useContext(AuthContext);
    const { FieldSet, Button } = UI;
    // console.log('auth context aapi', AuthAPI)

    const t = theme?.auth?.authPages?.sectionGroup?.default || {};
    const sectionGroupTheme = t;
    return (
        <div className={t.pageWrapper}>
            {/* Brand line — renders only when the theme provides `brandWrapper` (BC:
                themes without it render nothing here, exactly as before). */}
            {t.brandWrapper && (
              <div className={t.brandWrapper}>
                {t.brandMarkText && <span className={t.brandMark}>{t.brandMarkText}</span>}
                {t.brandNameText && <span className={t.brandName}>{t.brandNameText}</span>}
              </div>
            )}

            {/* Title block. When the theme sets `headingText` it renders the
                kicker + headline (+ accent) + subtitle; otherwise it falls back to the
                original single `pageTitle` "Sign In" (BC). */}
            {t.headingText ? (
              <div className={t.headingBlock}>
                {t.kickerText && <span className={t.kicker}>{t.kickerText}</span>}
                <h1 className={t.heading}>
                  {t.headingText}
                  {t.headingAccentText && <span className={t.headingAccent}>{t.headingAccentText}</span>}
                </h1>
                {t.subtitleText && <p className={t.subtitle}>{t.subtitleText}</p>}
              </div>
            ) : (
              <div className={t.pageTitle}>Sign In</div>
            )}
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
                        // Forgot link sits inline on the password label row (better tab
                        // order than a link between the password field and Sign In).
                        labelAccessory: (
                            <Link to={`${baseUrl}/password/forgot`} className={t.forgotPasswordText}>Forgot?</Link>
                        ),
                        onChange: (e) => {
                            setCredentials({...credentials, password: e.target.value})
                        }
                    },
                ]}
            />

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
                                    navigate(location?.state?.from || defaultRedirectUrl, { replace: true });
                                }
                            })
                            .catch(error => {
                                console.error('Cannot contact authentication server.', error);
                            });
                    }}
            > <span className={sectionGroupTheme.actionText}>Sign In</span> </Button>

            {/* Optional "or" divider + SSO button — render only when the theme opts in
                via `divider` / `ssoButton`. SSO has no provider wired yet, so clicking
                surfaces a friendly notice rather than failing silently. */}
            {t.divider && (
              <div className={t.divider}>{t.dividerText || 'or'}</div>
            )}
            {t.ssoButton && (
              <Button type={'plain'} className={t.ssoButton}
                      onClick={() => setError('Single sign-on is not available yet.')}>
                {t.ssoMarkText && <span className={t.ssoMark}>{t.ssoMarkText}</span>}
                {t.ssoButtonText || 'Continue with SSO'}
              </Button>
            )}

            {!disableSignup && (
              <div className={sectionGroupTheme.prompt}>
                Don't have an account?
                <span className={sectionGroupTheme.forgotPasswordText}><Link to={`${baseUrl}/signup`}>Sign up</Link></span>
              </div>
            )}

            {/* Optional trailing utility row (e.g. "browse without account" /
                "request access") — render only when the theme provides links. */}
            {Array.isArray(t.utilityLinks) && t.utilityLinks.length > 0 && (
              <div className={t.utilityWrapper}>
                {t.utilityLinks.map((l, i) => (
                  <Link key={i} to={l.to || '#'} className={t.utilityLink}>{l.text}</Link>
                ))}
              </div>
            )}

        </div>
    )
}
