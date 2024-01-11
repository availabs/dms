import React from 'react'

export function Header ({bgImg='/img/header.png', logo='/img/nygov-logo.png', title='MitigateNY', subTitle='New York State Hazard Mitigation Plan', note='2023 Update'}) {
  return (
    <div className='h-[300px] bg-cover bg-center w-full flex ' style={{ backgroundImage: `url("${bgImg}")` }}>
      <div className='p-2'>
        {logo && <img src={logo} alt="NYS Logo" />}
      </div>
      <div className='flex-1 flex flex-col  items-center p-4'>
        <div className='flex-1'/>
        <div className='text-3xl sm:text-7xl font-bold text-[#f2a91a] text-right w-full text-display'>
          {title && <div>{title}</div>}
        </div>
        <div className='text-lg tracking-wider pt-2 sm:text-3xl font-bold text-slate-200 text-right w-full uppercase'>
          {subTitle && <div>{subTitle}</div>}
        </div>
        <div className='text-lg tracking-wider sm:text-xl font-bold text-slate-200 text-right w-full uppercase'>
          {note && <div>{note}</div>}
        </div>
        <div className='flex-1'/>
      </div>
    </div>
  )
}