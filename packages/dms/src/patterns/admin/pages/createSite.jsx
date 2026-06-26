import React from 'react'
import {AdminContext} from "../context";
import { useFalcor } from "@availabs/avl-falcor";
import { useNavigate, useNavigation } from "react-router";
import { AuthContext } from '../../auth/context';
import { ThemeContext } from '../../../ui/useTheme';
import { getInstance, nameToSlug } from '../../../utils/type-utils';
import { createSiteTheme } from './createSite.theme'


export default function NewSite ({ apiUpdate, dataItems }) {
	const { UI, theme } = React.useContext(ThemeContext);
	const t = { ...createSiteTheme, ...(theme?.admin?.createSite || {}) }
	const { AuthAPI, PROJECT_NAME, setUser } = React.useContext(AuthContext)
	const { type: siteType, app, baseUrl } = React.useContext(AdminContext) || {};
	const { falcor } = useFalcor();
	const navigate = useNavigate();
	const { state: navState } = useNavigation();
	const isLoading = navState === 'loading';

	React.useEffect(() => {
		if (isLoading) return;
		if (dataItems === undefined) return;
		if (dataItems?.length > 0) navigate(baseUrl || '/');
	}, [dataItems, isLoading]);
	const {Input, Button} = UI;
	const [newUser, setNewUser] = React.useState({email: '', password: '', verify: ''});
	const [status, setStatus] = React.useState('');
	const [newSite, setNewSite] = React.useState({ site_name: '' });
	const [selectedTemplateId, setSelectedTemplateId] = React.useState('blank');
	const siteTemplates = theme?.site_templates ?? [];

	async function createSite () {
		if(newSite?.site_name?.length > 3 && newUser.email ) {
			try {
				const res = await AuthAPI.callAuthServer(`/init/setup`, {
					email: newUser.email,
					password: newUser.password,
					project: app,
				});
				if (res.error && res.error !== 'duplicate key value violates unique constraint "groups_pkey"') {
					setStatus(`Auth Init Data ${res.error}`);
					return;
				}

				// 1. Create the site
				const siteResult = await apiUpdate({data: newSite, skipNavigate: true});

				// 2. Create the auth pattern
				const siteInstance = getInstance(siteType) || siteType;
				const authPatternType = `${siteInstance}|auth:pattern`;
				const authData = {
					pattern_type: 'auth',
					name: 'Auth',
					base_url: 'auth',
					authPermissions: JSON.stringify({ groups: { [`${PROJECT_NAME} Admin`]: ['*'], public: [] }, users: {} }),
				};
				const patternRes = await falcor.call(
					["dms", "data", "create"],
					[app, authPatternType, authData]
				);
				const newPatternId = Object.keys(patternRes?.json?.dms?.data?.byId || {})
					.find(k => k !== '$__path');

				// 3. Create template patterns (page, datasets, etc.)
				let allPatternRefs = newPatternId
					? [{ ref: `${app}+${siteInstance}|pattern`, id: +newPatternId }]
					: [];
				let allEnvRefs = [];

				const selectedTemplate = siteTemplates.find(tmpl => tmpl.id === selectedTemplateId) ?? { patterns: [] };
				const pageTemplates = theme?.page_templates ?? [];

				for (const patternSpec of selectedTemplate.patterns) {
					const patternSlug = nameToSlug(patternSpec.name);
					const patternType = `${siteInstance}|${patternSlug}:pattern`;
					const templatePatternRes = await falcor.call(["dms", "data", "create"], [app, patternType, {
						pattern_type: patternSpec.pattern_type,
						name: patternSpec.name,
						base_url: patternSpec.base_url,
						authPermissions: JSON.stringify({ groups: { [`${PROJECT_NAME} Admin`]: ['*'], public: [] }, users: {} }),
					}]);
					const templatePatternId = Object.keys(templatePatternRes?.json?.dms?.data?.byId || {})
						.find(k => k !== '$__path');
					if (!templatePatternId) continue;

					allPatternRefs = [...allPatternRefs, { ref: `${app}+${siteInstance}|pattern`, id: +templatePatternId }];

					if (patternSpec.pattern_type === 'page' && patternSpec.pages?.length) {
						for (const pageSpec of patternSpec.pages) {
							const tmpl = pageTemplates.find(pt => pt.id === pageSpec.template);
							await falcor.call(["dms", "data", "create"], [app, `${patternSlug}|page`, {
								title: pageSpec.title,
								index: 0,
								published: 'draft',
								draft_sections: tmpl?.draft_sections ?? [],
								draft_section_groups: tmpl?.draft_section_groups ?? [],
							}]);
						}
					}

					if (patternSpec.pattern_type === 'datasets' && patternSpec.sources?.length) {
						const envSlug = nameToSlug('default');
						const envType = `${siteInstance}|${envSlug}:dmsenv`;
						const envRes = await falcor.call(["dms", "data", "create"], [app, envType, { name: 'default', sources: [] }]);
						const envId = Object.keys(envRes?.json?.dms?.data?.byId || {})
							.find(k => k !== '$__path');

						if (envId) {
							allEnvRefs = [...allEnvRefs, { ref: `${app}+${siteInstance}|dmsenv`, id: +envId }];
							await falcor.call(["dms", "data", "edit"], [app, +templatePatternId, { dmsEnvId: +envId }]);

							let sourceRefs = [];
							for (const sourceSpec of patternSpec.sources) {
								const sourceSlug = nameToSlug(sourceSpec.name);
								const sourceRes = await falcor.call(["dms", "data", "create"], [app, `${envSlug}|${sourceSlug}:source`, {
									name: sourceSpec.name,
									type: sourceSpec.source_type,
									...(sourceSpec.config ? { config: JSON.stringify(sourceSpec.config) } : {}),
								}]);
								const sourceId = Object.keys(sourceRes?.json?.dms?.data?.byId || {})
									.find(k => k !== '$__path');
								if (!sourceId) continue;

								sourceRefs = [...sourceRefs, { ref: `${app}+${envSlug}|source`, id: +sourceId }];

								// Create initial views and attach refs to the source
								if (sourceSpec.views?.length) {
									let viewRefs = [];
									for (let vi = 0; vi < sourceSpec.views.length; vi++) {
										const viewSpec = sourceSpec.views[vi];
										const viewType = `${sourceSlug}|v${vi + 1}:view`;
										const viewRes = await falcor.call(["dms", "data", "create"], [app, viewType, {
											name: viewSpec.name,
										}]);
										const viewId = Object.keys(viewRes?.json?.dms?.data?.byId || {})
											.find(k => k !== '$__path');
										if (viewId) {
											viewRefs = [...viewRefs, { ref: `${app}+${sourceSlug}|view`, id: +viewId }];

											if (viewSpec.rows?.length) {
												const dataType = `${sourceSlug}|${viewId}:data`;
												for (const row of viewSpec.rows) {
													await falcor.call(["dms", "data", "create"], [app, dataType, row]);
												}
											}
										}
									}
									if (viewRefs.length) {
										await falcor.call(["dms", "data", "edit"], [app, +sourceId, { views: viewRefs }]);
									}
								}
							}

							if (sourceRefs.length) {
								await falcor.call(["dms", "data", "edit"], [app, +envId, { sources: sourceRefs }]);
							}
						}
					}
				}

				// 4. Update site with all pattern refs (and env refs if any)
				if (siteResult?.id && allPatternRefs.length) {
					const siteUpdate = { patterns: allPatternRefs };
					if (allEnvRefs.length) siteUpdate.dms_envs = allEnvRefs;
					await falcor.call(["dms", "data", "edit"], [app, +siteResult.id, siteUpdate]);
				}

				// 5. Auto-login so the user lands directly on the admin edit page
				const loginRes = await AuthAPI.callAuthServer(`/login`, {
					email: newUser.email,
					password: newUser.password,
					project: PROJECT_NAME,
				});
				if (loginRes?.user?.token) {
					window.localStorage.setItem('userToken', loginRes.user.token);
					setUser({ ...loginRes.user, groups: [...(loginRes.user.groups || []), 'public'], authed: true, isAuthenticating: false });
				}

				navigate(baseUrl || '/');
			} catch (error) {
				console.error('Error creating site:', error);
				setStatus('Error creating site');
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

	return (
		<div className={t.wrapper}>
			<div className={t.form}>
				<InputComp
					Comp={Input}
					label='Create Your Site'
					placeholder='Site Name'
					value={newSite.site_name}
					onChange={(e) => setNewSite({...newSite, ['site_name']: e.target.value })}
				/>

				<InputComp
					Comp={Input}
					type={'text'}
					label='Email'
					placeholder='email'
					value={newUser.email}
					onChange={(e) => setNewUser({...newUser, ['email']: e.target.value})}
				/>
				<InputComp
					Comp={Input}
					type={'password'}
					label='Password'
					placeholder='password'
					value={newUser.password}
					onChange={(e) => setNewUser({...newUser, ['password']: e.target.value})}
				/>
				<InputComp
					Comp={Input}
					type={'password'}
					label='Verify Password'
					placeholder='verify password'
					value={newUser.verify}
					onChange={(e) => setNewUser({...newUser, ['verify']: e.target.value})}
				/>

				{siteTemplates.length > 0 && (
					<div className={t.templateSection}>
						<label className={t.templateLabel}>Site Template</label>
						<div className={t.templateGrid}>
							{siteTemplates.map(tmpl => (
								<div
									key={tmpl.id}
									className={selectedTemplateId === tmpl.id ? t.templateCardSelected : t.templateCard}
									onClick={() => setSelectedTemplateId(tmpl.id)}
								>
									<div className={t.templateCardName}>{tmpl.name}</div>
									<div className={t.templateCardDesc}>{tmpl.description}</div>
								</div>
							))}
						</div>
					</div>
				)}

				<div>
					<Button disabled={ (newUser.password !== newUser.verify) || !newSite.site_name } onClick={createSite}>
						Create
					</Button>
				</div>
				<div>
					{status}
				</div>
			</div>
	 	</div>
	)
}

function InputComp({label, value, placeholder="", onChange, type='text', Comp}) {
  const { theme } = React.useContext(ThemeContext)
  const t = { ...createSiteTheme, ...(theme?.admin?.createSite || {}) }
  return (
      <div className={t.inputWrapper} data-headlessui-state="">
         {label && <label data-slot="label" className={t.inputLabel}>{label}</label>}
         <span data-slot="control" className={t.inputControlSpan}>
          <Comp
              type={type}
            value={value}
            placeholder={placeholder}
            onChange={onChange}
            className={t.input}
            data-autofocus=""
          />
         </span>
      </div>

  )
}
