import React from 'react'
import { AdminContext } from "../context";
import { ThemeContext } from '../../../ui/useTheme';
import { authedFetch } from '../../../utils/authedFetch';
import { appSettingsCardTheme } from './appSettingsCard.theme'
import { NOT_OFFERED } from './settingsMessages';

// A site's icon, app name and colours, on the tenant's settings page (site-app-settings-pwa.md). They
// are what the site shows in a browser tab and when it is installed to a phone's home screen. Reads and
// writes go through dms-server's /tenants/:tenant/app-settings routes (or /hub/app-settings for the
// hub's own site, when no tenant is named); the server draws the icon set from the one upload.
const HEX = /^#[0-9a-f]{6}$/i;
const FIELDS = ['name', 'short_name', 'theme_color', 'background_color'];

export function AppSettingsCard({ tenant, apiBase }) {
	const { API_HOST, user } = React.useContext(AdminContext) || {};
	const { UI, theme } = React.useContext(ThemeContext) || {};
	const { Button, Input, Icon } = UI;
	const t = { ...appSettingsCardTheme, ...(theme?.admin?.appSettingsCard || {}) };

	const [info, setInfo] = React.useState(null);     // the server's answer: { settings, fallbackName, preview }
	const [draft, setDraft] = React.useState({});
	const [error, setError] = React.useState('');
	const [busy, setBusy] = React.useState('');
	const [saved, setSaved] = React.useState(false);
	const fileRef = React.useRef(null);

	// `apiBase` as in pgEnvsCard.jsx: the app's or a tenant's routes; without it, a tenant's or the hub's own site's
	const base = `${API_HOST}${apiBase || (tenant ? `/tenants/${encodeURIComponent(tenant)}` : '/hub')}/app-settings`;

	const take = (json) => {
		setInfo(json);
		setDraft(Object.fromEntries(FIELDS.map(k => [k, json.settings?.[k] || ''])));
	};

	const call = async (path, options) => {
		const res = await authedFetch(`${base}${path}`, { user, ...options });
		const json = await res.json().catch(() => ({}));
		if (!res.ok) throw new Error(json.error || (res.status === 404 && apiBase ? NOT_OFFERED : `request failed (${res.status})`));
		take(json);
		return json;
	};

	React.useEffect(() => {
		call('').catch(e => setError(e.message));
	}, [base, user?.token]);

	const run = async (what, fn) => {
		setBusy(what);
		setError('');
		setSaved(false);
		try { await fn(); return true; }
		catch (e) { setError(e.message); return false; }
		finally { setBusy(''); }
	};

	const dirty = info && FIELDS.some(k => (draft[k] || '') !== (info.settings?.[k] || ''));
	const badColour = ['theme_color', 'background_color'].find(k => draft[k] && !HEX.test(draft[k]));

	const save = () => run('save', () => call('', {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
	})).then(ok => ok && setSaved(true));

	const upload = (file) => {
		if (!file) return;
		run('upload', () => call('/icon', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file }));
	};

	const removeIcon = () => run('remove', () => call('/icon/remove', { method: 'POST' }));

	if (!info) {
		return (
			<div className={t.card}>
				<div className={t.loading}>{error || 'Loading…'}</div>
			</div>
		);
	}

	const name = draft.name || info.fallbackName || 'Untitled';
	const shortName = draft.short_name || name;
	const colourField = (key, label) => (
		<div className={t.field}>
			<span className={t.label}>{label}</span>
			<div className={t.colorRow}>
				<input type='color' className={t.swatch} aria-label={`${label} picker`}
					value={HEX.test(draft[key] || '') ? draft[key] : (key === 'background_color' ? '#ffffff' : '#000000')}
					onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))} />
				<Input type='text' activeStyle='mono' value={draft[key] || ''} placeholder='#rrggbb' aria-label={label}
					onChange={e => setDraft(d => ({ ...d, [key]: e.target.value.trim() }))} />
			</div>
		</div>
	);

	return (
		<div className={t.card}>
			<div className={t.cardHeader}>
				<span className={t.cardTitle}>app and icon</span>
				<span className={t.cardSubtitle}>browser tab and home screen</span>
			</div>

			<div className={t.body}>
				<div className={t.form}>
					<div className={t.field}>
						<span className={t.label}>Icon</span>
						<div className={t.iconRow}>
							<div className={t.iconTile}>
								{info.preview ? <img className={t.iconImg} src={info.preview} alt='' /> : <span className={t.iconEmpty}>None</span>}
							</div>
							<div className={t.iconActions}>
								<Button activeStyle='small' disabled={!!busy} onClick={() => fileRef.current?.click()}>
									<Icon icon='Upload' className={t.iconSm} />
									{busy === 'upload' ? 'Uploading…' : info.preview ? 'Replace' : 'Upload'}
								</Button>
								{info.preview && (
									<Button activeStyle='small' disabled={!!busy} onClick={removeIcon}>
										{busy === 'remove' ? 'Removing…' : 'Remove'}
									</Button>
								)}
							</div>
							<input ref={fileRef} type='file' className={t.fileInput} accept='image/png,image/jpeg,image/webp,image/svg+xml'
								onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
						</div>
						<span className={t.help}>Square, 512px or larger. PNG, JPEG, WebP or SVG.</span>
					</div>

					<div className={t.pair}>
						<label className={t.field}>
							<span className={t.label}>Name</span>
							<Input type='text' value={draft.name || ''} placeholder={info.fallbackName || 'Site name'}
								onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
						</label>
						<label className={t.field}>
							<span className={t.label}>Short name</span>
							<Input type='text' value={draft.short_name || ''} placeholder={name}
								onChange={e => setDraft(d => ({ ...d, short_name: e.target.value }))} />
							<span className={t.help}>Under the home-screen icon. About 12 characters fit.</span>
						</label>
					</div>

					<div className={t.pair}>
						{colourField('theme_color', 'Theme colour')}
						{colourField('background_color', 'Background colour')}
					</div>

					<div className={t.footer}>
						<Button activeStyle='primary' disabled={!dirty || !!badColour || !!busy} onClick={save}>
							{busy === 'save' ? 'Saving…' : 'Save'}
						</Button>
						{saved && !dirty && <span className={t.saved}>Saved</span>}
						{badColour && <span className={t.errorText}>Colours must be #rrggbb.</span>}
						{error && <span className={t.errorText}>{error}</span>}
					</div>
				</div>

				<div className={t.preview}>
					<div className={t.field}>
						<span className={t.previewLabel}>Browser</span>
						<div className={t.browser}>
							<div className={t.browserBar} style={HEX.test(draft.theme_color || '') ? { background: draft.theme_color } : undefined}>
								<span className={t.browserDot} /><span className={t.browserDot} /><span className={t.browserDot} />
							</div>
							<div className={t.browserTab}>
								{info.preview ? <img className={t.tabIcon} src={info.preview} alt='' /> : <span className={t.tabIconEmpty} />}
								<span className={t.tabName}>{name}</span>
							</div>
						</div>
					</div>
					<div className={t.field}>
						<span className={t.previewLabel}>Home screen</span>
						<div className={t.home}>
							<div className={t.homeApp}>
								<div className={t.homeTile} style={{ background: HEX.test(draft.background_color || '') ? draft.background_color : '#ffffff' }}>
									{info.preview && <img className={t.homeImg} src={info.preview} alt='' />}
								</div>
								<span className={t.homeName}>{shortName}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
