import React from 'react'

// Whether this site is its API server's hub, the one site whose admin installs plugins there (dms-server
// GET /_dms/plugins/host). Several statically served sites (Netlify SPAs) can share one API host; only its hub
// shows the Plugins page (pages/plugins.jsx). null while asking; false when the server says no, is older than the
// route (404) or can't be reached. Asked once per API host and app per page load, and only when `ask` is true
// (the user could see the page at all), so other admins send no request.
const answers = new Map()   // `${API_HOST}|${app}` -> { promise, value }

export function usePluginHub(API_HOST, app, ask) {
	const key = `${API_HOST}|${app}`
	const [hub, setHub] = React.useState(() => answers.get(key)?.value ?? null)

	React.useEffect(() => {
		if (!ask || !app) return
		let live = true
		let entry = answers.get(key)
		if (!entry) {
			entry = { value: null }
			entry.promise = fetch(`${String(API_HOST || '').replace(/\/+$/, '')}/_dms/plugins/host?app=${encodeURIComponent(app)}`)
				.then(res => (res.ok ? res.json() : {}))
				.then(json => json?.hub === true)
				.catch(() => { answers.delete(key); return false })   // unreachable: ask again on a later mount
				.then(value => { entry.value = value; return value })
			answers.set(key, entry)
		}
		entry.promise.then(value => { if (live) setHub(value) })
		return () => { live = false }
	}, [API_HOST, app, key, ask])

	return ask ? hub : false
}
