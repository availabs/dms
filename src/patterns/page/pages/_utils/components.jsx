import React from 'react'

export const defaultLogo = (
	<Link to={`${baseUrl || '/'}`} className='h-12 flex px-4 items-center'>
	  <div className='rounded-full h-8 w-8 bg-blue-500 border-2 border-blue-300 hover:bg-blue-600' />
	</Link>
)