import React from 'react'
import * as Headless from '@headlessui/react'
import { PencilIcon, CircleCheck, CircleX } from '../../icons'
import { CMSContext } from '../../../siteConfig';

export const inputTheme = {
  input: 'relative w-full block appearance-none rounded-lg px-[calc(theme(spacing[3.5])-1px)] py-[calc(theme(spacing[2.5])-1px)] sm:px-[calc(theme(spacing[3])-1px)] sm:py-[calc(theme(spacing[1.5])-1px)] text-base/6 text-zinc-950 placeholder:text-zinc-500 sm:text-sm/6 dark:text-white border border-zinc-950/10 data-[hover]:border-zinc-950/20 dark:border-white/10 dark:data-[hover]:border-white/20 bg-transparent dark:bg-white/5 focus:outline-none data-[invalid]:border-red-500 data-[invalid]:data-[hover]:border-red-500 data-[invalid]:dark:border-red-500 data-[invalid]:data-[hover]:dark:border-red-500 data-[disabled]:border-zinc-950/20 dark:data-[hover]:data-[disabled]:border-white/15 data-[disabled]:dark:border-white/15 data-[disabled]:dark:bg-white/[2.5%] dark:[color-scheme:dark]',
  inputContainer: 'group flex relative w-full before:absolute before:inset-px before:rounded-[calc(theme(borderRadius.lg)-1px)] before:bg-white before:shadow dark:before:hidden after:pointer-events-none after:absolute after:inset-0 after:rounded-lg after:ring-inset after:ring-transparent sm:after:focus-within:ring-2 sm:after:focus-within:ring-blue-500 has-[[data-disabled]]:opacity-50 before:has-[[data-disabled]]:bg-zinc-950/5 before:has-[[data-disabled]]:shadow-none before:has-[[data-invalid]]:shadow-red-500/10',
  confirmButtonContainer: 'absolute right-0 hidden group-hover:flex items-center',
  editButton: 'py-1.5 px-2 text-slate-400 hover:text-blue-500 cursor-pointer bg-white/10',
  cancelButton:'text-slate-400 hover:text-red-500 cursor-pointer  py-1.5 pr-1 ',
  confirmButton:'text-green-500 hover:text-white hover:bg-green-500 cursor-pointer rounded-full'

}

export default function Input ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded,...props}) {
  const { theme = { input: inputTheme, field: fieldTheme } } = React.useContext(CMSContext) || {}
  return (
    <span className={`${theme?.input?.inputContainer}`}>
      <Headless.Input type={type} className={`${theme?.input?.input}`} value={value} onChange={onChange} {...props}/>
    </span>
  )
}

export function ConfirmInput ({ type='text', label, description, value, onChange=() => {}, placeholder, disabled, onClick=()=>{}, rounded, EditIcon=PencilIcon, ConfirmIcon=CircleCheck, CancelIcon=CircleX}) {
  const { theme = { input: inputTheme, field: fieldTheme } } = React.useContext(CMSContext) || {}
  const [tempValue, setTempValue] = React.useState(value)
  const [editing, setEditing] = React.useState(false)
  React.useEffect(() => setTempValue(value), [value])

  return (
    <span className={`${theme?.input?.inputContainer}`}>
      { editing ? 
        <Headless.Input type={type} value={tempValue} onChange={e => setTempValue(e.target.value)} className={`${theme?.input?.input}`} /> : 
        <div className={`${theme?.input?.input}`}>{tempValue}</div>
      }
      
      {!editing ? 
        (<div className={`${theme?.input?.confirmButtonContainer} ${theme?.input?.editButton}`} onClick={() => setEditing(true)}><EditIcon className={'size-5.5'} /></div>) : 
        (<div className={`${theme?.input?.confirmButtonContainer}`}>
        
            <div className={`${theme?.input?.confirmButton}`} onClick={() => { onChange(tempValue); setEditing(false); }}><ConfirmIcon /></div>
            <div className={`${theme?.input?.cancelButton}`} onClick={() => { setTempValue(value);setEditing(false);}}><CancelIcon /></div>
         
        </div>
        )
      }
      
    </span>
  )
}
