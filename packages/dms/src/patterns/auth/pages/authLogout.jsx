import React, {useEffect} from "react";
import { useNavigate, useLocation } from "react-router";
import { AuthContext } from "../context";
import { syncSessionCookie } from "../api";

export default function AuthLogout () {
    const {defaultRedirectUrl, setUser} = React.useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (window.localStorage) {
            window.localStorage.removeItem('userToken');
        }
        syncSessionCookie(null);
        setUser({authed: false})
        navigate(location?.state?.from || defaultRedirectUrl);
    }, []);

    return (
        <div>
            Logging out...
        </div>
    )
}
