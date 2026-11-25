import React from 'react'
import { PluginsCard } from '../../components/pluginsCard'

// Settings → Plugins (settingsRegistry.js): the plugins this app has turned on (components/pluginsCard.jsx). Was a
// card on the hub's tenant page only; now on every app's Settings and on the hub's page for a tenant.
export default function SettingsPlugins({ target = {} }) {
	return <PluginsCard apiBase={target.apiBase} />
}
