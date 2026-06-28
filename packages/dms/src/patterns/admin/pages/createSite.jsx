import React from 'react'
import {AdminContext} from "../context";
import { useFalcor } from "@availabs/avl-falcor";
import { useNavigate, useNavigation } from "react-router";
import { AuthContext } from '../../auth/context';
import { ThemeContext } from '../../../ui/useTheme';
import { getInstance } from '../../../utils/type-utils';
import { provisionTemplatePatterns } from '../../../utils/tenantProvisioning';
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

	React.useEffect(() => {
		if (isLoading) return;
		if (dataItems === undefined) return;
		if (dataItems?.length > 0) navigate(baseUrl || '/');
	}, [dataItems, isLoading]);
	const {Input, Button} = UI;
	const [newUser, setNewUser] = React.useState({email: '', password: '', verify: ''});
	const [status, setStatus] = React.useState('');
	const [newSite, setNewSite] = React.useState({ site_name: '' });
	const [selectedTemplateId, setSelectedTemplateId] = React.useState('simple_site');
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
				const pageTemplates = theme?.page_templates ?? [];
				const { allPatternRefs: templatePatternRefs, allEnvRefs } = await provisionTemplatePatterns(falcor, {
					app,
					siteInstance,
					selectedTemplateId,
					siteTemplates,
					pageTemplates,
					adminGroupName: PROJECT_NAME,
				});
				const allPatternRefs = newPatternId
					? [{ ref: `${app}+${siteInstance}|pattern`, id: +newPatternId }, ...templatePatternRefs]
					: templatePatternRefs;

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

				<SiteTemplatePicker
					siteTemplates={siteTemplates}
					selectedTemplateId={selectedTemplateId}
					onSelect={setSelectedTemplateId}
				/>

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
