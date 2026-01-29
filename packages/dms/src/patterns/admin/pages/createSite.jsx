import React from 'react'
import {AdminContext} from "../context";
// import { Link, useLocation } from 'react-router'
import { AuthContext } from '../../auth/context';
import { ThemeContext } from '../../../ui/useTheme';


export default function NewSite ({app, apiUpdate}) {
	const { UI } = React.useContext(ThemeContext);
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
          if (res.error && res.error !== 'duplicate key value violates unique constraint "groups_pkey"') {
            setStatus(`Auth Init Data ${res.error}`)
          } else {
            //console.log('newsite data', newSite)
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

function InputComp({label, value, placeholder="", onChange, type='text', Comp}) {
  return (
      <div className="w-full [&>[data-slot=label]+[data-slot=control]]:mt-3 [&>[data-slot=label]+[data-slot=description]]:mt-1 [&>[data-slot=description]+[data-slot=control]]:mt-3 [&>[data-slot=control]+[data-slot=description]]:mt-3 [&>[data-slot=control]+[data-slot=error]]:mt-3 [&>[data-slot=label]]:font-medium" data-headlessui-state="">
         {label && <label data-slot="label" className="select-none text-base/6 text-zinc-950 data-[disabled]:opacity-50 sm:text-sm/">{label}</label>}
         <span data-slot="control" className="relative block w-full before:absolute before:inset-px before:rounded-[calc(theme(borderRadius.lg)-1px)] before:bg-white before:shadow dark:before:hidden after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-inset after:ring-transparent sm:after:focus-within:ring-2 sm:after:focus-within:ring-blue-500 has-[[data-disabled]]:opacity-50 before:has-[[data-disabled]]:bg-zinc-950/5 before:has-[[data-disabled]]:shadow-none before:has-[[data-invalid]]:shadow-red-500/10">
          <Comp
              type={type}
            value={value}
            placeholder={placeholder}
            onChange={onChange}
            className="relative shadow block w-full appearance-none rounded-lg px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing[3])-1px)] sm:py-[calc(theme(spacing[1.5])-1px)] text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/ border border-zinc-950/10 data-[hover]:border-zinc-950/20 dark:border-white/10 dark:data-[hover]:border-white/20 bg-transparent dark:bg-white/5 focus:outline-none data-[invalid]:border-red-500 data-[invalid]:data-[hover]:border-red-500 data-[invalid]:dark:border-red-500 data-[invalid]:data-[hover]:dark:border-red-500 data-[disabled]:border-zinc-950/20 dark:data-[hover]:data-[disabled]:border-white/15 data-[disabled]:dark:border-white/15 data-[disabled]:dark:bg-white/[2.5%]"
            data-autofocus=""
          />
         </span>
      </div>

  )
}
