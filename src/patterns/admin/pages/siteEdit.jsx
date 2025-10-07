import React from 'react'
import { InputComp , ButtonPrimary} from '../ui'
import {AdminContext} from "../siteConfig";
import { Link, useLocation } from 'react-router'
import { AuthContext } from '../../auth/context';


function NewSite ({app, user, AUTH_HOST, apiUpdate}) {
	const { UI } = React.useContext(AdminContext);
	const { AuthAPI, PROJECT_NAME } = React.useContext(AuthContext)
	const {Input, Button} = UI;
	const [newUser, setNewUser] = React.useState({email: '', password: '', verify: ''});
	const [status, setStatus] = React.useState('');
	const [newSite, setNewSite] = React.useState({
		site_name: '',
		patterns: [{pattern_type: 'auth', name: 'Auth', base_url: 'dms_auth', authPermissions: JSON.stringify({[`${PROJECT_NAME} Admin`]: ['*']})}]
	})

	async function createSite () {
		if(newSite?.site_name?.length > 3 && newUser.email ) {
			await AuthAPI.callAuthServer(`/init/setup`,
				{
					email: newUser.email,
					password: newUser.password,
					project: app,
				})
				.then(res => {
					console.log('res', res)
					if (res.error) {
						setStatus(res.error)
					} else {
						apiUpdate({data: newSite})
					}
				})
				.catch(error => {
					console.error('Cannot contact authentication server.');
				});
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
		<div className={'h-full w-full bg-slate-100 flex items-top justify-center'}>
			<div className='w-full h-fit max-h-fit p-4 flex flex-col justify-between gap-3'>
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


function SiteEdit ({
   item={},
   dataItems,
   attributes,
   updateAttribute,
   status,
   apiUpdate,
   format,
	...props
}) {

	const { baseUrl, authPath, theme, app, user, AUTH_HOST } = React.useContext(AdminContext) || {}
	const location = useLocation()
  const updateData = (data, attrKey) => {
		console.log('admin pattern - siteEdit - updateData', attrKey, data, format)
		apiUpdate({data: {...item, ...{[attrKey]: data}}, config: {format}})
	}

	if(!item.id && dataItems?.length > 0) {
		item = dataItems[0]
	}

	if(!item.id) return <NewSite app={app} user={user} AUTH_HOST={AUTH_HOST} apiUpdate={apiUpdate} />// (<Layout></Layout>)()
	//if(!user?.authed) return <div>To access this page, you need to: <Link to={`${authPath}/login`} state={{ from: location.pathname }}>login</Link></div>

	const menuItems = [
		{
			name: <div className=''>Dashboard</div>,
			className:''
		},
		{
			name:'manage sites',
			className: 'px-6 pb-1 pt-4 uppercase text-xs text-blue-400'
		},
	]

	item.patterns.forEach(p =>{
		menuItems.push({
			name: (
				<div className='w-full flex-1 flex items-center'>
					<Link to={`${p.base_url === '/' ? '' : p.base_url}/manage`} className='flex-1'>{p.doc_type}</Link>
					{/*<div className='px-2'>x</div>
					<div className='px-2'>y</div>*/}
				</div>
			)
		})
	})


	return (
		<>
			{Object.keys(attributes)
				.filter(attr => !['site_name', 'themes'].includes(attr))
				.map((attrKey, i) => {
					let EditComp = attributes[attrKey].EditComp
					//console.log('what', attributes[attrKey])
					return (
						<div key={`${attrKey}-${i}`}>
							<EditComp
								key={`${attrKey}-${i}`}
								value={item?.[attrKey]}
								onChange={(v) => updateAttribute(attrKey, v)}
								onSubmit={data => {
									//console.log('updateData', data,attrKey)
									updateData(data, attrKey)
								}}
								format={format}
								attributes={attributes[attrKey].attributes}
							/>
						</div>
					)
				})
			}
		</>
	)
}

export default SiteEdit
