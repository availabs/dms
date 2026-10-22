import React from 'react'
import {AdminContext} from "../context";
import { useFalcor } from "@availabs/avl-falcor";
import { useNavigate, useNavigation } from "react-router";
import { AuthContext } from '../../auth/context';
import { ThemeContext } from '../../../ui/useTheme';
import { getInstance } from '../../../utils/type-utils';
import { provisionTemplatePatterns, createCorePatterns } from '../../../utils/tenantProvisioning';
import { createSiteTheme } from './createSite.theme'
import SiteTemplatePicker from './SiteTemplatePicker'


export default function NewSite ({ apiUpdate, dataItems }) {
	const { UI, theme } = React.useContext(ThemeContext);
	const t = { ...createSiteTheme, ...(theme?.admin?.createSite || {}) }
	const { AuthAPI, PROJECT_NAME, setUser } = React.useContext(AuthContext)
	const { type: siteType, app, baseUrl } = React.useContext(AdminContext) || {};
	const { falcor } = useFalcor();
	const navigate = useNavigate();
	const { state: navState } = useNavigation();
	const isLoading = navState === 'loading';

	const {Input, Button, Icon} = UI;
	const [newUser, setNewUser] = React.useState({email: '', password: '', verify: ''});
	// progress: index into STEPS while creating; error: the message when a run fails
	const [step, setStep] = React.useState(0);
	const [error, setError] = React.useState('');
	const [newSite, setNewSite] = React.useState({ site_name: '' });
	const [selectedTemplateId, setSelectedTemplateId] = React.useState('simple_site');
	const [submitting, setSubmitting] = React.useState(false);
	const siteTemplates = theme?.site_templates ?? [];

	React.useEffect(() => {
		if (isLoading) return;
		if (dataItems === undefined) return;
		// While createSite() is running, the site row already exists but the
		// patterns aren't registered yet — navigating away here tears down the
		// flow mid-provisioning and strands the site without patterns.
		if (submitting) return;
		if (dataItems?.length > 0) navigate(baseUrl || '/');
	}, [dataItems, isLoading, submitting]);

	async function createSite () {
		if(newSite?.site_name?.length > 3 && newUser.email ) {
			setSubmitting(true);
			setError('');
			setStep(0);
			try {
				const res = await AuthAPI.callAuthServer(`/init/setup`, {
					email: newUser.email,
					password: newUser.password,
					project: app,
				});
				// "already initialized" means auth for this project is fully set
				// up (groups linked) — safe to continue creating the site.
				if (res.error
					&& res.error !== 'duplicate key value violates unique constraint "groups_pkey"'
					&& !/already initialized/.test(res.error)) {
					setError(`Auth Init Data ${res.error}`);
					setSubmitting(false);
					return;
				}

				// Sign in before writing anything: the server checks every dms.data write
				// (dataAuth.js), and the new `${app} Admin` user is what may create the site.
				// The token goes to localStorage now (falcor sends it per request); the user
				// state is set at the end, so nothing re-renders mid-provisioning.
				const loginRes = await AuthAPI.callAuthServer(`/login`, {
					email: newUser.email,
					password: newUser.password,
					project: PROJECT_NAME,
				});
				if (!loginRes?.user?.token) throw new Error(`Sign-in failed: ${loginRes?.error || 'no token'}`);
				window.localStorage.setItem('userToken', loginRes.user.token);

				// 1. Create the site
				setStep(1);
				const siteResult = await apiUpdate({data: newSite, skipNavigate: true});
				if (!siteResult?.id) throw new Error('Site row was not created.');

				// 2. Create the auth + admin patterns and register them on the site right away
				const siteInstance = getInstance(siteType) || siteType;
				const corePatternRefs = await createCorePatterns(falcor, {
					app,
					siteInstance,
					siteId: siteResult.id,
					adminGroupName: PROJECT_NAME,
					adminPath: baseUrl || '/',
				});

				// 3. Create template patterns (page, datasets, etc.). Passing
				// siteId makes provisioning register each pattern on the site
				// as it's created, so an interrupted flow still leaves a
				// working (partial) site instead of orphaned patterns.
				setStep(2);
				const pageTemplates = theme?.page_templates ?? [];
				const { allPatternRefs: templatePatternRefs, allEnvRefs } = await provisionTemplatePatterns(falcor, {
					app,
					siteInstance,
					selectedTemplateId,
					siteTemplates,
					pageTemplates,
					adminGroupName: PROJECT_NAME,
					siteId: siteResult.id,
					initialPatternRefs: corePatternRefs,
				});
				const allPatternRefs = [...corePatternRefs, ...templatePatternRefs];

				// 4. Final consolidated write of all pattern refs (and env refs if any).
				// Through apiUpdate, not falcor.call: the site row itself was created
				// through apiUpdate (the local store, with sync on), and the list page
				// we land on reads that same copy. The refs written straight to the
				// server above never reach it, so the list showed no auth/admin rows
				// and its next save wiped them (found live 2026-09-29).
				if (allPatternRefs.length) {
					const siteUpdate = { id: +siteResult.id, patterns: allPatternRefs };
					if (allEnvRefs.length) siteUpdate.dms_envs = allEnvRefs;
					await apiUpdate({ data: siteUpdate, skipNavigate: true });
				}

				// 5. Signed in (above), so the user lands directly on the admin edit page
				setStep(3);
				setUser({ ...loginRes.user, groups: [...(loginRes.user.groups || []), 'public'], authed: true, isAuthenticating: false });

				navigate(baseUrl || '/');
			} catch (error) {
				console.error('Error creating site:', error);
				setError(`${error.message || error}`);
				setSubmitting(false);
			}
		}
	}

	// todo: login / signup to create a new site
	// existing user: login, then prompt to create site.
	// 				   after creating site, create project for app,
	// 				   create group for app + 'admin',
	// 				   assign group to project with auth level 10.
	// 				   assign logged in user to the group,
	// new user: create user,
	// 			 follow above steps
	// create a public group

	const nameTooShort = newSite.site_name.length > 0 && newSite.site_name.length <= 3;
	const mismatch = newUser.verify.length > 0 && newUser.password !== newUser.verify;
	const canCreate = !submitting && newSite.site_name.length > 3 && !!newUser.email && newUser.password === newUser.verify;

	return (
		<div className={t.wrapper}>
			<div className={t.header}>
				<h1 className={t.headerTitle}>New site</h1>
				<p className={t.headerSubtitle}>Name the site, set up its first admin, and pick what it starts with.</p>
			</div>
			<div className={t.grid}>
				<div className={t.formColumn}>
					{submitting ? (
						<div className={t.progress}>
							<p className={t.progressTitle}>Creating {newSite.site_name}</p>
							<Steps t={t} Icon={Icon} current={step} />
							<p className={t.progressHint}>Keep this page open until it finishes.</p>
						</div>
					) : (
						<form className={t.form} onSubmit={(e) => { e.preventDefault(); if (canCreate) createSite(); }}>
							{error && (
								<div className={t.formSection}>
									<div className={t.errorBox}>
										<p className={t.errorTitle}>{"Couldn't create the site"}</p>
										<p className={t.errorText}>{error}</p>
									</div>
									<Steps t={t} Icon={Icon} current={step} failed />
								</div>
							)}
							<div className={error ? t.formSectionDivided : t.formSection}>
								<p className={t.sectionLabel}>site</p>
								<Field t={t} label='site name' hint='At least 4 characters.' error={nameTooShort && 'At least 4 characters.'}>
									<Input
										value={newSite.site_name}
										placeholder='e.g. Riverbend County Hazard Plan'
										aria-invalid={nameTooShort || undefined}
										onChange={(e) => setNewSite({...newSite, site_name: e.target.value})}
									/>
								</Field>
							</div>
							<div className={t.formSectionDivided}>
								<p className={t.sectionLabel}>first admin</p>
								<Field t={t} label='email'>
									<Input
										type='email'
										value={newUser.email}
										placeholder='you@example.org'
										onChange={(e) => setNewUser({...newUser, email: e.target.value})}
									/>
								</Field>
								<div className={t.fieldPair}>
									<Field t={t} label='password'>
										<Input
											type='password'
											value={newUser.password}
											placeholder='password'
											onChange={(e) => setNewUser({...newUser, password: e.target.value})}
										/>
									</Field>
									<Field t={t} label='verify password' error={mismatch && "Passwords don't match."}>
										<Input
											type='password'
											value={newUser.verify}
											placeholder='verify password'
											aria-invalid={mismatch || undefined}
											onChange={(e) => setNewUser({...newUser, verify: e.target.value})}
										/>
									</Field>
								</div>
								<p className={t.sectionHint}>{"This account becomes the site's admin. You're signed in when the site is ready."}</p>
							</div>
							{siteTemplates.length > 0 && (
								<div className={t.formSectionDivided}>
									<p className={t.sectionLabel}>start from</p>
									<SiteTemplatePicker
										label={null}
										siteTemplates={siteTemplates}
										selectedTemplateId={selectedTemplateId}
										onSelect={setSelectedTemplateId}
									/>
								</div>
							)}
							<div className={t.formFooter}>
								<Button type='submit' activeStyle={t.submitButtonStyle} disabled={!canCreate}>Create site</Button>
							</div>
						</form>
					)}
				</div>
			</div>
		</div>
	)
}

const STEPS = ['Setting up authentication', 'Creating site', 'Creating site content from template', 'Signing you in'];

// The four stages createSite() moves through. `failed` lists the steps up to the one that failed.
function Steps({ t, Icon, current, failed }) {
	const steps = failed ? STEPS.slice(0, current + 1) : STEPS;
	return (
		<ol className={t.progressSteps}>
			{steps.map((label, i) => {
				const state = i < current ? 'done' : i === current && !failed ? 'now' : 'todo';
				return (
					<li key={label} className={`${t.step} ${state === 'done' ? t.stepDone : state === 'now' ? t.stepNow : t.stepTodo}`}>
						{state === 'done' && <span className={t.stepIconDone}><Icon icon='Check' className={t.stepIconDoneGlyph} /></span>}
						{state === 'now' && <span className={t.stepIconNow}><span className={t.stepIconNowDot} /></span>}
						{state === 'todo' && <span className={t.stepIconTodo} />}
						{label}
					</li>
				);
			})}
		</ol>
	);
}

function Field({ t, label, hint, error, children }) {
	const { UI: { FieldLabel } } = React.useContext(ThemeContext);
	return (
		<div className={t.field}>
			<FieldLabel text={label}>{children}</FieldLabel>
			{error ? <p className={t.fieldError}>{error}</p> : hint ? <p className={t.fieldHint}>{hint}</p> : null}
		</div>
	)
}
