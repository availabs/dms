import React, {useEffect} from "react";
import {useNavigate} from "react-router";
import {AuthContext} from "../siteConfig";

export default () => {
    const {defaultRedirectUrl, setUser} = React.useContext(AuthContext);
    const navigate = useNavigate();

    useEffect(() => {
        if (window.localStorage) {
            window.localStorage.removeItem('userToken');
        }
        setUser({authed: false})
        navigate(defaultRedirectUrl);
    }, []);

    return (
        <div>
            Logging out...
        </div>
    )
}