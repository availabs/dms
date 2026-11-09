import React from "react";
import {Link} from "react-router";
import {ThemeContext} from "../../../ui/useTheme";
import {AuthContext} from "../context";
import { rankUserGroups } from "../../../utils/auth";
import { PatternAuthContext } from "../../../utils/patternAuthContext";

// The signed-in user's own account: their groups on this site (from their sign-in, ranked like the user
// menu) and a reset-password link. Nothing here needs an admin grant.
export default function Profile () {
    const {theme, UI} = React.useContext(ThemeContext);
    const { user, baseUrl } = React.useContext(AuthContext);
    const patternAuth = React.useContext(PatternAuthContext);
    const {Icon} = UI;
    const groups = rankUserGroups({ user, ...patternAuth });

    // Manage-page chrome from `theme.auth.authPages.manage`; fallbacks are the
    // literals this page carried before the keys existed.
    const m = {
        profileWrapper: "flex flex-col",
        headerRow: "w-full flex justify-between border-b-2 border-blue-400",
        headerTitle: "text-2xl font-semibold text-gray-700",
        avatar: "hidden",
        notice: "",
        profileLink: "",
        profileActions: "",
        profileActionsLabel: "hidden",
        profileField: "flex items-baseline gap-3 mb-3",
        profileFieldLabel: "text-xs text-gray-500 w-16",
        profileFieldValue: "text-sm",
        ...(theme?.auth?.authPages?.manage || {}),
    };
    if(!user?.authed) return <div className={m.notice}>To access this page, you need to login.</div>

    return (
        <div className={m.profileWrapper}>
            <div className={m.headerRow}>
                <span className={m.avatar}>{(user.email || '?')[0].toUpperCase()}</span>
                <div className={m.headerTitle}>{user.email}</div>
            </div>
            <div className={m.profileActions}>
                <div className={m.profileField}>
                    <span className={m.profileFieldLabel}>groups</span>
                    <span className={m.profileFieldValue}>{groups.length ? groups.join(' · ') : 'none on this site'}</span>
                </div>
                <Link to={`${baseUrl}/password/reset`} className={m.profileLink}>
                    <Icon icon="Key" className="w-4 h-4" />
                    Reset Password
                </Link>
            </div>
        </div>
    )
}
