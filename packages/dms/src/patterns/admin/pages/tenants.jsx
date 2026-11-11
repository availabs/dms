import React from 'react'
import { useFalcor } from "@availabs/avl-falcor";
import { useNavigate, useNavigation } from 'react-router'
import { AdminContext } from "../context";
import { siteCan, MANAGE_TENANTS } from '../../../utils/adminPermissions';
import { saveSiteRefList } from '../utils';
import { TenantList } from '../components/tenantList';

// /list/tenants: the platform root's tenants. Only on the root domain of a
// multi-tenant site (`tenantSubdomain` is the host's tenant, '' on the
// root) and only for a user with manage-tenants; anyone else is sent to the
// admin's start page, as SiteEdit sends a user without list access away.
export default function TenantsPage({
	item = {},
	dataItems,
	updateAttribute,
	apiUpdate,
	format,
}) {
	const { baseUrl, authPath, app, user, authPermissions, isMultiTenant, subdomain, tenantSubdomain = subdomain } = React.useContext(AdminContext) || {}
	const navigate = useNavigate()
	const { state: navState } = useNavigation()
	const { falcor } = useFalcor()

	if (!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	// While a loader is in flight dataItems is [] (wrapper.jsx), so don't judge on it.
	const isLoading = navState === 'loading'
	const isPlatformRoot = Boolean(isMultiTenant) && !tenantSubdomain
	const hasAccess = isPlatformRoot && siteCan(user, app, authPermissions, MANAGE_TENANTS)

	React.useEffect(() => {
		if (isLoading || dataItems === undefined) return
		if (!user?.authed) {
			navigate(`${authPath}/login`, { state: { from: `${baseUrl}/tenants` } })
			return
		}
		// user is seeded from localStorage with placeholder groups while the real
		// ones load (auth/providers.jsx): don't judge access on that.
		if (user?.isAuthenticating) return
		if (!hasAccess) navigate(baseUrl || '/')
	}, [isLoading, dataItems, user?.authed, user?.isAuthenticating, JSON.stringify(user?.groups), hasAccess])

	if (isLoading || dataItems === undefined || !item?.id || !user?.authed || !hasAccess) {
		return null
	}

	return (
		<TenantList
			value={item?.tenants || []}
			rootSite={{ id: item.id, name: item?.site_name || item?.name }}
			onChange={(v) => updateAttribute('tenants', v)}
			onSubmit={(data) => saveSiteRefList({ falcor, apiUpdate, format, app, item, attrKey: 'tenants', data })}
		/>
	)
}
