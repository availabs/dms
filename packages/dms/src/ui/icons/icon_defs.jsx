import React from 'react'

// Core/Required Icons
export const Default = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.25-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
  </svg>
)

export const Settings = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
  </svg>
)

export const Pages = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
)

export const History = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M12 22C6.47711 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.4776 2 20.2257 4.94289 21.5 9H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8V12L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21.9551 13C21.9848 12.6709 22 12.3373 22 12M15 22C15.3416 21.8876 15.6753 21.7564 16 21.6078M20.7906 17C20.9835 16.6284 21.1555 16.2433 21.305 15.8462M18.1925 20.2292C18.5369 19.9441 18.8631 19.6358 19.1688 19.3065" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Sections = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-.98.626-1.813 1.5-2.122" />
  </svg>
)

export const Blank = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
  </svg>
)

// Action Icons
export const PencilEditSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M16.2141 4.98239L17.6158 3.58063C18.39 2.80646 19.6452 2.80646 20.4194 3.58063C21.1935 4.3548 21.1935 5.60998 20.4194 6.38415L19.0176 7.78591M16.2141 4.98239L10.9802 10.2163C9.93493 11.2616 9.41226 11.7842 9.05637 12.4211C8.70047 13.058 8.3424 14.5619 8 16C9.43809 15.6576 10.942 15.2995 11.5789 14.9436C12.2158 14.5877 12.7384 14.0651 13.7837 13.0198L19.0176 7.78591M16.2141 4.98239L19.0176 7.78591" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 12C21 16.2426 21 18.364 19.682 19.682C18.364 21 16.2426 21 12 21C7.75736 21 5.63604 21 4.31802 19.682C3 18.364 3 16.2426 3 12C3 7.75736 3 5.63604 4.31802 4.31802C5.63604 3 7.75736 3 12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const ViewIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M21.544 11.045C21.848 11.4713 22 11.6845 22 12C22 12.3155 21.848 12.5287 21.544 12.955C20.1779 14.8706 16.6892 19 12 19C7.31078 19 3.8221 14.8706 2.45604 12.955C2.15201 12.5287 2 12.3155 2 12C2 11.6845 2.15201 11.4713 2.45604 11.045C3.8221 9.12944 7.31078 5 12 5C16.6892 5 20.1779 9.12944 21.544 11.045Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const PencilIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} fill="none" {...props}>
    <path d="M15.2141 5.98239L16.6158 4.58063C17.39 3.80646 18.6452 3.80646 19.4194 4.58063C20.1935 5.3548 20.1935 6.60998 19.4194 7.38415L18.0176 8.78591M15.2141 5.98239L6.98023 14.2163C5.93493 15.2616 5.41226 15.7842 5.05637 16.4211C4.70047 17.058 4.3424 18.5619 4 20C5.43809 19.6576 6.94199 19.2995 7.57889 18.9436C8.21579 18.5877 8.73844 18.0651 9.78375 17.0198L18.0176 8.78591M15.2141 5.98239L18.0176 8.78591" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 20H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const CirclePlus = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

export const SquarePlus = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M12 8V16M16 12H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const WrenchIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M20.3584 13.3567C19.1689 14.546 16.9308 14.4998 13.4992 14.4998C11.2914 14.4998 9.50138 12.7071 9.50024 10.4993C9.50024 7.07001 9.454 4.83065 10.6435 3.64138C11.8329 2.45212 12.3583 2.50027 17.6274 2.50027C18.1366 2.49809 18.3929 3.11389 18.0329 3.47394L15.3199 6.18714C14.6313 6.87582 14.6294 7.99233 15.3181 8.68092C16.0068 9.36952 17.1234 9.36959 17.8122 8.68109L20.5259 5.96855C20.886 5.60859 21.5019 5.86483 21.4997 6.37395C21.4997 11.6422 21.5479 12.1675 20.3584 13.3567Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M13.5 14.5L7.32842 20.6716C6.22386 21.7761 4.433 21.7761 3.32843 20.6716C2.22386 19.567 2.22386 17.7761 3.32843 16.6716L9.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5.50896 18.5H5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const SlidersIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M4 5.00024L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M13 5L20 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 9L16 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M10 2L10 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 16L12 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M16 12L20 12.0002" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 12.0002L13 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 19L20 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 19.0002L9 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const MenuIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M4 4.5L20 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 14.5L20 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 9.5L20 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 19.5L20 19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const ClockIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M12 22C6.47711 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.4776 2 20.2257 4.94289 21.5 9H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8V12L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21.9551 13C21.9848 12.6709 22 12.3373 22 12M15 22C15.3416 21.8876 15.6753 21.7564 16 21.6078M20.7906 17C20.9835 16.6284 21.1555 16.2433 21.305 15.8462M18.1925 20.2292C18.5369 19.9441 18.8631 19.6358 19.1688 19.3065" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const InfoCircle = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12.2422 17V12C12.2422 11.5286 12.2422 11.2929 12.0957 11.1464C11.9493 11 11.7136 11 11.2422 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.992 8H12.001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const TrashCan = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9.5 16.5L9.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M14.5 16.5L14.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const RemoveCircle = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M16 12L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4.64856 5.07876C4.78691 4.93211 4.92948 4.7895 5.0761 4.65111M7.94733 2.72939C8.12884 2.6478 8.31313 2.57128 8.5 2.5M2.73172 7.94192C2.64925 8.12518 2.57195 8.31127 2.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const CancelCircle = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} fill="none" {...props}>
    <path d="M2.75 12C2.75 17.5228 7.22715 22 12.75 22C18.2728 22 22.75 17.5228 22.75 12C22.75 6.47714 18.2728 1.99998 12.75 1.99998" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5.39856 5.07874C5.53691 4.9321 5.67948 4.78948 5.8261 4.65109M8.69733 2.72938C8.87884 2.64779 9.06313 2.57126 9.25 2.49998M3.48172 7.94191C3.39925 8.12517 3.32195 8.31126 3.25 8.49999" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15.75 9L12.75 12M12.75 12L9.75 15M12.75 12L15.75 15M12.75 12L9.75 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const FloppyDisk = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M8 22V19C8 17.1144 8 16.1716 8.58579 15.5858C9.17157 15 10.1144 15 12 15C13.8856 15 14.8284 15 15.4142 15.5858C16 16.1716 16 17.1144 16 19V22" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10 7H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 11.8584C3 7.28199 3 4.99376 4.38674 3.54394C4.43797 3.49038 4.49038 3.43797 4.54394 3.38674C5.99376 2 8.28199 2 12.8584 2C13.943 2 14.4655 2.00376 14.9628 2.18936C15.4417 2.3681 15.8429 2.70239 16.6452 3.37099L18.8411 5.20092C19.9027 6.08561 20.4335 6.52795 20.7168 7.13266C21 7.73737 21 8.42833 21 9.81025V13C21 16.7497 21 18.6246 20.0451 19.9389C19.7367 20.3634 19.3634 20.7367 18.9389 21.0451C17.6246 22 15.7497 22 12 22C8.25027 22 6.3754 22 5.06107 21.0451C4.6366 20.7367 4.26331 20.3634 3.95491 19.9389C3 18.6246 3 16.7497 3 13V11.8584Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const CirclePlusDot = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4.64856 5.07876C4.7869 4.93211 4.92948 4.7895 5.0761 4.65111M7.94733 2.72939C8.12884 2.6478 8.31313 2.57128 8.5 2.5M2.5 8.5C2.57195 8.31127 2.64925 8.12518 2.73172 7.94192" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8V16M16 12L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const PencilSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M16.2141 4.98239L17.6158 3.58063C18.39 2.80646 19.6452 2.80646 20.4194 3.58063C21.1935 4.3548 21.1935 5.60998 20.4194 6.38415L19.0176 7.78591M16.2141 4.98239L10.9802 10.2163C9.93493 11.2616 9.41226 11.7842 9.05637 12.4211C8.70047 13.058 8.3424 14.5619 8 16C9.43809 15.6576 10.942 15.2995 11.5789 14.9436C12.2158 14.5877 12.7384 14.0651 13.7837 13.0198L19.0176 7.78591M16.2141 4.98239L19.0176 7.78591" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 12C21 16.2426 21 18.364 19.682 19.682C18.364 21 16.2426 21 12 21C7.75736 21 5.63604 21 4.31802 19.682C3 18.364 3 16.2426 3 12C3 7.75736 3 5.63604 4.31802 4.31802C5.63604 3 7.75736 3 12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const CircleCheck = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
)

export const CircleX = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
)

// Navigation Icons
export const ArrowDownSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M9.5 13.5C9.99153 14.0057 11.2998 16 12 16M14.5 13.5C14.0085 14.0057 12.7002 16 12 16M12 16V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const ArrowUpSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M9.5 10.5C9.99153 9.9943 11.2998 8 12 8M14.5 10.5C14.0085 9.9943 12.7002 8 12 8M12 8V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const ChevronDownSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M17 10C17 10 13.3176 14 12 14C10.6824 14 7 10 7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const ChevronUpSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M17 14C17 14 13.3176 10 12 10C10.6824 9.99999 7 14 7 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const ArrowUp = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M17.9998 15C17.9998 15 13.5809 9.00001 11.9998 9C10.4187 8.99999 5.99985 15 5.99985 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const ArrowDown = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const ArrowLeft = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={22} height={22} stroke="currentColor" fill="none" {...props}>
    <path d="M15 6C15 6 9.00001 10.4189 9 12C8.99999 13.5812 15 18 15 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const ArrowRight = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={22} height={22} stroke="currentColor" fill="none" {...props}>
    <path d="M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const CaretDown = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
)

export const CaretUp = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
  </svg>
)

// UI Icons
export const InfoSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12.2422 17V12C12.2422 11.5286 12.2422 11.2929 12.0957 11.1464C11.9493 11 11.7136 11 11.2422 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.992 8H12.001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const MoreSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M11.992 12H12.001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.9842 16H11.9932" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.9998 8H12.0088" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.48438 12C2.48438 7.52166 2.48438 5.28249 3.87562 3.89124C5.26686 2.5 7.50603 2.5 11.9844 2.5C16.4627 2.5 18.7019 2.5 20.0931 3.89124C21.4844 5.28249 21.4844 7.52166 21.4844 12C21.4844 16.4783 21.4844 18.7175 20.0931 20.1088C18.7019 21.5 16.4627 21.5 11.9844 21.5C7.50603 21.5 5.26686 21.5 3.87562 20.1088C2.48438 18.7175 2.48438 16.4783 2.48438 12Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const UserCircle = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M12 2C17.5237 2 22 6.47778 22 12C22 17.5222 17.5237 22 12 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 21.5C7.81163 21.0953 6.69532 20.5107 5.72302 19.7462M5.72302 4.25385C6.69532 3.50059 7.81163 2.90473 9 2.5M2 10.2461C2.21607 9.08813 2.66019 7.96386 3.29638 6.94078M2 13.7539C2.21607 14.9119 2.66019 16.0361 3.29638 17.0592" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 16.5C10.0726 14.302 13.9051 14.1986 16 16.5M14.2179 9.75C14.2179 10.9926 13.2215 12 11.9925 12C10.7634 12 9.76708 10.9926 9.76708 9.75C9.76708 8.50736 10.7634 7.5 11.9925 7.5C13.2215 7.5 14.2179 8.50736 14.2179 9.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const User = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="#fff" {...props}>
    <path d="M6.57757 15.4816C5.1628 16.324 1.45336 18.0441 3.71266 20.1966C4.81631 21.248 6.04549 22 7.59087 22H16.4091C17.9545 22 19.1837 21.248 20.2873 20.1966C22.5466 18.0441 18.8372 16.324 17.4224 15.4816C14.1048 13.5061 9.89519 13.5061 6.57757 15.4816Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16.5 6.5C16.5 8.98528 14.4853 11 12 11C9.51472 11 7.5 8.98528 7.5 6.5C7.5 4.01472 9.51472 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const Tags = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <circle cx="1.5" cy="1.5" r="1.5" transform="matrix(1 0 0 -1 16 8)" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.77423 11.1439C1.77108 12.2643 1.7495 13.9546 2.67016 15.1437C4.49711 17.5033 6.49674 19.5029 8.85633 21.3298C10.0454 22.2505 11.7357 22.2289 12.8561 21.2258C15.8979 18.5022 18.6835 15.6559 21.3719 12.5279C21.6377 12.2187 21.8039 11.8397 21.8412 11.4336C22.0062 9.63798 22.3452 4.46467 20.9403 3.05974C19.5353 1.65481 14.362 1.99377 12.5664 2.15876C12.1603 2.19608 11.7813 2.36233 11.472 2.62811C8.34412 5.31646 5.49781 8.10211 2.77423 11.1439Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 14L10 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Copy = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" {...props}>
    <path d="M16.9637 8.98209C16.9613 6.03194 16.9167 4.50384 16.0578 3.45753C15.892 3.25546 15.7067 3.07019 15.5047 2.90436C14.4008 1.99854 12.7609 1.99854 9.48087 1.99854C6.20089 1.99854 4.5609 1.99854 3.45708 2.90436C3.255 3.07018 3.06971 3.25546 2.90387 3.45753C1.99799 4.56128 1.99799 6.20116 1.99799 9.48091C1.99799 12.7607 1.99799 14.4005 2.90387 15.5043C3.0697 15.7063 3.255 15.8916 3.45708 16.0574C4.50346 16.9162 6.03167 16.9608 8.98201 16.9632" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14.0283 9.02455L16.994 8.98193M14.0143 22.0013L16.9799 21.9586M21.9716 14.0221L21.9436 16.9818M9.01033 14.0357L8.98236 16.9953M11.4873 9.02455C10.6545 9.17371 9.31781 9.32713 9.01033 11.0488M19.4946 21.9586C20.3296 21.8223 21.6685 21.6894 22.0025 19.9726M19.4946 9.02455C20.3274 9.17371 21.6641 9.32713 21.9716 11.0488M11.5 21.9573C10.6672 21.8086 9.33039 21.6559 9.02197 19.9344" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Download = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" {...props}>
    <path d="M12 14.5L12 4.5M12 14.5C11.2998 14.5 9.99153 12.5057 9.5 12M12 14.5C12.7002 14.5 14.0085 12.5057 14.5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 16.5C20 18.982 19.482 19.5 17 19.5H7C4.518 19.5 4 18.982 4 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const PDF = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} stroke="currentColor" fill="none" {...props}>
    <path d="M19 11C19 10.1825 19 9.4306 18.8478 9.06306C18.6955 8.69552 18.4065 8.40649 17.8284 7.82843L13.0919 3.09188C12.593 2.593 12.3436 2.34355 12.0345 2.19575C11.9702 2.165 11.9044 2.13772 11.8372 2.11401C11.5141 2 11.1614 2 10.4558 2C7.21082 2 5.58831 2 4.48933 2.88607C4.26731 3.06508 4.06508 3.26731 3.88607 3.48933C3 4.58831 3 6.21082 3 9.45584V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H19M12 2.5V3C12 5.82843 12 7.24264 12.8787 8.12132C13.7574 9 15.1716 9 18 9H18.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 14H19C18.4477 14 18 14.4477 18 15V16.5M18 16.5V19M18 16.5H20.5M7 19V17M7 17V14H8.5C9.32843 14 10 14.6716 10 15.5C10 16.3284 9.32843 17 8.5 17H7ZM12.5 14H13.7857C14.7325 14 15.5 14.7462 15.5 15.6667V17.3333C15.5 18.2538 14.7325 19 13.7857 19H12.5V14Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Printer = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} stroke="currentColor" fill="none" {...props}>
    <path d="M7.35396 18C5.23084 18 4.16928 18 3.41349 17.5468C2.91953 17.2506 2.52158 16.8271 2.26475 16.3242C1.87179 15.5547 1.97742 14.5373 2.18868 12.5025C2.36503 10.8039 2.45321 9.95455 2.88684 9.33081C3.17153 8.92129 3.55659 8.58564 4.00797 8.35353C4.69548 8 5.58164 8 7.35396 8H16.646C18.4184 8 19.3045 8 19.992 8.35353C20.4434 8.58564 20.8285 8.92129 21.1132 9.33081C21.5468 9.95455 21.635 10.8039 21.8113 12.5025C22.0226 14.5373 22.1282 15.5547 21.7352 16.3242C21.4784 16.8271 21.0805 17.2506 20.5865 17.5468C19.8307 18 18.7692 18 16.646 18" stroke="currentColor" strokeWidth="1.5" />
    <path d="M17 8V6C17 4.11438 17 3.17157 16.4142 2.58579C15.8284 2 14.8856 2 13 2H11C9.11438 2 8.17157 2 7.58579 2.58579C7 3.17157 7 4.11438 7 6V8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M13.9887 16L10.0113 16C9.32602 16 8.98337 16 8.69183 16.1089C8.30311 16.254 7.97026 16.536 7.7462 16.9099C7.57815 17.1904 7.49505 17.5511 7.32884 18.2724C7.06913 19.3995 6.93928 19.963 7.02759 20.4149C7.14535 21.0174 7.51237 21.5274 8.02252 21.7974C8.40513 22 8.94052 22 10.0113 22L13.9887 22C15.0595 22 15.5949 22 15.9775 21.7974C16.4876 21.5274 16.8547 21.0174 16.9724 20.4149C17.0607 19.963 16.9309 19.3995 16.6712 18.2724C16.505 17.5511 16.4218 17.1904 16.2538 16.9099C16.0297 16.536 15.6969 16.254 15.3082 16.1089C15.0166 16 14.674 16 13.9887 16Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M18 12H18.009" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Add = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill="none" {...props}>
    <path d="M12 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 12H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const XMark = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
)

export const AdjustmentsHorizontal = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
  </svg>
)

export const LinkSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill="none" {...props}>
    <path d="M11.1004 3.00208C7.4515 3.00864 5.54073 3.09822 4.31962 4.31931C3.00183 5.63706 3.00183 7.75796 3.00183 11.9997C3.00183 16.2415 3.00183 18.3624 4.31962 19.6801C5.6374 20.9979 7.75836 20.9979 12.0003 20.9979C16.2421 20.9979 18.3631 20.9979 19.6809 19.6801C20.902 18.4591 20.9916 16.5484 20.9982 12.8996" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20.4803 3.51751L14.931 9.0515M20.4803 3.51751C19.9863 3.023 16.6587 3.0691 15.9552 3.0791M20.4803 3.51751C20.9742 4.01202 20.9282 7.34329 20.9182 8.04754" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const DraftPage = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={22} height={22} stroke="currentColor" fill="none" {...props}>
    <path d="M19.7502 11V10C19.7502 6.22876 19.7502 4.34315 18.5786 3.17157C17.407 2 15.5214 2 11.7502 2H10.7503C6.97907 2 5.09346 2 3.92189 3.17156C2.75032 4.34312 2.7503 6.22872 2.75027 9.99993L2.75024 14C2.7502 17.7712 2.75019 19.6568 3.92172 20.8284C5.09329 21.9999 6.97897 22 10.7502 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.25024 7H15.2502M7.25024 12H15.2502" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M13.2502 20.8268V22H14.4236C14.833 22 15.0377 22 15.2217 21.9238C15.4058 21.8475 15.5505 21.7028 15.84 21.4134L20.6636 16.5894C20.9366 16.3164 21.0731 16.1799 21.1461 16.0327C21.285 15.7525 21.285 15.4236 21.1461 15.1434C21.0731 14.9961 20.9366 14.8596 20.6636 14.5866C20.3905 14.3136 20.254 14.1771 20.1067 14.1041C19.8265 13.9653 19.4975 13.9653 19.2173 14.1041C19.0701 14.1771 18.9335 14.3136 18.6605 14.5866L18.6605 14.5866L13.8369 19.4106C13.5474 19.7 13.4027 19.8447 13.3265 20.0287C13.2502 20.2128 13.2502 20.4174 13.2502 20.8268Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
)

export const EllipsisVertical = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
  </svg>
)

export const Filter = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} fill="none" {...props}>
    <path d="M8.85746 12.5061C6.36901 10.6456 4.59564 8.59915 3.62734 7.44867C3.3276 7.09253 3.22938 6.8319 3.17033 6.3728C2.96811 4.8008 2.86701 4.0148 3.32795 3.5074C3.7889 3 4.60404 3 6.23433 3H17.7657C19.396 3 20.2111 3 20.672 3.5074C21.133 4.0148 21.0319 4.8008 20.8297 6.37281C20.7706 6.83191 20.6724 7.09254 20.3726 7.44867C19.403 8.60062 17.6261 10.6507 15.1326 12.5135C14.907 12.6821 14.7583 12.9567 14.7307 13.2614C14.4837 15.992 14.2559 17.4876 14.1141 18.2442C13.8853 19.4657 12.1532 20.2006 11.226 20.8563C10.6741 21.2466 10.0043 20.782 9.93278 20.1778C9.79643 19.0261 9.53961 16.6864 9.25927 13.2614C9.23409 12.9539 9.08486 12.6761 8.85746 12.5061Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const LoadingHourGlass = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} fill="none" {...props}>
    <path d="M17.2014 2H6.79876C5.341 2 4.06202 2.9847 4.0036 4.40355C3.93009 6.18879 5.18564 7.37422 6.50435 8.4871C8.32861 10.0266 9.24075 10.7964 9.33642 11.7708C9.35139 11.9233 9.35139 12.0767 9.33642 12.2292C9.24075 13.2036 8.32862 13.9734 6.50435 15.5129C5.14932 16.6564 3.9263 17.7195 4.0036 19.5964C4.06202 21.0153 5.341 22 6.79876 22L17.2014 22C18.6591 22 19.9381 21.0153 19.9965 19.5964C20.043 18.4668 19.6244 17.342 18.7352 16.56C18.3298 16.2034 17.9089 15.8615 17.4958 15.5129C15.6715 13.9734 14.7594 13.2036 14.6637 12.2292C14.6487 12.0767 14.6487 11.9233 14.6637 11.7708C14.7594 10.7964 15.6715 10.0266 17.4958 8.4871C18.8366 7.35558 20.0729 6.25809 19.9965 4.40355C19.9381 2.9847 18.6591 2 17.2014 2Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 21.6381C9 21.1962 9 20.9752 9.0876 20.7821C9.10151 20.7514 9.11699 20.7214 9.13399 20.6923C9.24101 20.509 9.42211 20.3796 9.78432 20.1208C10.7905 19.4021 11.2935 19.0427 11.8652 19.0045C11.955 18.9985 12.045 18.9985 12.1348 19.0045C12.7065 19.0427 13.2095 19.4021 14.2157 20.1208C14.5779 20.3796 14.759 20.509 14.866 20.6923C14.883 20.7214 14.8985 20.7514 14.9124 20.7821C15 20.9752 15 21.1962 15 21.6381V22H9V21.6381Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const Search = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M17.5 17.5L22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 11C20 6.02944 15.9706 2 11 2C6.02944 2 2 6.02944 2 11C2 15.9706 6.02944 20 11 20C15.9706 20 20 15.9706 20 11Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
)

// Data/Table Icons
export const TallyMark = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M5 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M13 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M17 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 18L18 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const LeftToRightListBullet = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M8 5L20 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 5H4.00898" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 12H4.00898" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 19H4.00898" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 12L20 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M8 19L20 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const Sum = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14} fill="none" {...props}>
    <path d="M19 17.14c0 1.5 0 2.25-.35 2.8-.18.29-.43.53-.72.71-.56.35-1.32.35-2.85.35H9.2c-2.59 0-3.88 0-4.15-.74-.27-.73.71-1.56 2.68-3.22l3.94-3.33c.94-.8 1.41-1.19 1.41-1.7 0-.52-.47-.91-1.41-1.71L7.72 6.96C5.75 5.3 4.77 4.47 5.05 3.73c.28-.73 1.57-.73 4.15-.73h5.89c1.53 0 2.3 0 2.85.34.29.18.54.43.72.72.35.55.35 1.31.35 2.81" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Avg = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M21 21H10C6.70017 21 5.05025 21 4.02513 19.9749C3 18.9497 3 17.2998 3 14V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M6 12H6.00898M8.9982 12H9.00718M11.9964 12H12.0054M14.9946 12H15.0036M17.9928 12H18.0018M20.991 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 7C6.67348 5.87847 7.58712 5 8.99282 5C14.9359 5 11.5954 17 17.9819 17C19.3976 17 20.3057 16.1157 21 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

export const Group = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M4 6H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 12H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4 18H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M19 4V8C19 9 20 10 21 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M19 20V16C19 15 20 14 21 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const SortAsc = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="#fff" {...props}>
    <path d="M4 14H8.42109C9.35119 14 9.81624 14 9.94012 14.2801C10.064 14.5603 9.74755 14.8963 9.11466 15.5684L5.47691 19.4316C4.84402 20.1037 4.52757 20.4397 4.65145 20.7199C4.77533 21 5.24038 21 6.17048 21H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 9L6.10557 4.30527C6.49585 3.43509 6.69098 3 7 3C7.30902 3 7.50415 3.43509 7.89443 4.30527L10 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17.5 20V4M17.5 20C16.7998 20 15.4915 18.0057 15 17.5M17.5 20C18.2002 20 19.5085 18.0057 20 17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const SortDesc = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="#fff" {...props}>
    <path d="M4 3H8.42109C9.35119 3 9.81624 3 9.94012 3.28013C10.064 3.56026 9.74755 3.89632 9.11466 4.56842L5.47691 8.43158C4.84402 9.10368 4.52757 9.43974 4.65145 9.71987C4.77533 10 5.24038 10 6.17048 10H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 21L6.10557 16.3053C6.49585 15.4351 6.69098 15 7 15C7.30902 15 7.50415 15.4351 7.89443 16.3053L10 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17.5 20V4M17.5 20C16.7998 20 15.4915 18.0057 15 17.5M17.5 20C18.2002 20 19.5085 18.0057 20 17.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Math Icons
export const Brackets = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M6 3C3.58901 4.93486 2 8.24345 2 12C2 15.7565 3.58901 19.0651 6 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 3C20.411 4.93486 22 8.24345 22 12C22 15.7565 20.411 19.0651 18 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Divide = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M3 12H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M14.5 5.5C14.5 6.88071 13.3807 8 12 8C10.6193 8 9.5 6.88071 9.5 5.5C9.5 4.11929 10.6193 3 12 3C13.3807 3 14.5 4.11929 14.5 5.5Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M14.5 18.5C14.5 19.8807 13.3807 21 12 21C10.6193 21 9.5 19.8807 9.5 18.5C9.5 17.1193 10.6193 16 12 16C13.3807 16 14.5 17.1193 14.5 18.5Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const Multiplication = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M18 6L12 12M12 12L6 18M12 12L18 18M12 12L6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const Minus = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M20 12L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

// Page/Document Icons
export const Page = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42" fill="none" {...props}>
    <path d="M29.55 10.95L19.05 0.450044C18.918 0.303466 18.7558 0.18731 18.5745 0.109612C18.3932 0.0319142 18.1972 -0.00547053 18 4.40737e-05H3C2.20507 0.00237881 1.44336 0.319199 0.881259 0.881303C0.319155 1.44341 0.00233473 2.20511 0 3.00004V39C0.00233473 39.795 0.319155 40.5567 0.881259 41.1188C1.44336 41.6809 2.20507 41.9977 3 42H27C27.7949 41.9977 28.5566 41.6809 29.1187 41.1188C29.6808 40.5567 29.9977 39.795 30 39V12C30.0055 11.8029 29.9681 11.6069 29.8904 11.4256C29.8127 11.2443 29.6966 11.082 29.55 10.95ZM18 3.60004L26.4 12H18V3.60004ZM27 39H3V3.00004H15V12C15.0023 12.795 15.3192 13.5567 15.8813 14.1188C16.4434 14.6809 17.2051 14.9977 18 15H27V39Z" fill="#2D3E4C" />
  </svg>
)

export const Section = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" {...props}>
    <g clipPath="url(#clip0_2741_71019)">
      <path d="M38.55 13.95L28.05 3.45C27.75 3.15 27.45 3 27 3H12C10.35 3 9 4.35 9 6V42C9 43.65 10.35 45 12 45H36C37.65 45 39 43.65 39 42V15C39 14.55 38.85 14.25 38.55 13.95ZM27 6.6L35.4 15H27V6.6ZM36 42H12V6H24V15C24 16.65 25.35 18 27 18H36V42Z" fill="#2D3E4C" />
      <path d="M15 33H33V36H15V33Z" fill="#2D3E4C" />
      <path d="M15 24H33V27H15V24Z" fill="#2D3E4C" />
    </g>
    <defs>
      <clipPath id="clip0_2741_71019">
        <rect width="48" height="48" fill="white" />
      </clipPath>
    </defs>
  </svg>
)

// Special Icons
export const GlobalEditing = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M10.0775 22.0001C5.46844 21.0622 2 16.9869 2 12.1016C2 6.52267 6.5233 2.00006 12.1031 2.00006C16.9838 2.00006 21.0562 5.46049 22 10.0614" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M18.4332 13.8485C18.7685 13.4852 18.9362 13.3035 19.1143 13.1976C19.5442 12.9419 20.0736 12.934 20.5107 13.1766C20.6918 13.2772 20.8646 13.4537 21.2103 13.8068C21.5559 14.1599 21.7287 14.3364 21.8272 14.5215C22.0647 14.968 22.0569 15.5087 21.8066 15.9479C21.7029 16.1299 21.5251 16.3012 21.1694 16.6437L16.9378 20.7195C16.2638 21.3687 15.9268 21.6932 15.5056 21.8577C15.0845 22.0222 14.6214 22.0101 13.6954 21.9859L13.5694 21.9826C13.2875 21.9753 13.1466 21.9716 13.0646 21.8786C12.9827 21.7856 12.9939 21.642 13.0162 21.3548L13.0284 21.1989C13.0914 20.3907 13.1228 19.9865 13.2807 19.6233C13.4385 19.26 13.7107 18.965 14.2552 18.3751L18.4332 13.8485Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M20 5.69905C19.0653 5.76642 17.8681 6.1283 17.0379 7.20283C15.5385 9.14367 14.039 9.30562 13.0394 8.65867C11.5399 7.68826 12.8 6.11642 11.0401 5.26221C9.89313 4.70548 9.73321 3.19051 10.3716 2.00006" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M2 11.0001C2.7625 11.6622 3.83046 12.2683 5.08874 12.2683C7.68843 12.2683 8.20837 12.765 8.20837 14.7519C8.20837 16.7387 8.20837 16.7387 8.72831 18.2289C9.06651 19.1982 9.18472 20.1675 8.5106 21.0001" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
)

export const Database = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <ellipse cx="12" cy="5" rx="8" ry="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 10.842C7.60158 11.0229 8.27434 11.1718 9 11.282" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M20 12C20 13.6569 16.4183 15 12 15C7.58172 15 4 13.6569 4 12" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 17.842C7.60158 18.0229 8.27434 18.1718 9 18.282" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M20 5V19C20 20.6569 16.4183 22 12 22C7.58172 22 4 20.6569 4 19V5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

export const AccessControl = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} fill="none" {...props}>
    <path d="M17 10V9C17 5.70017 17 4.05025 15.9749 3.02513C14.9497 2 13.2998 2 10 2C6.70017 2 5.05025 2 4.02513 3.02513C3 4.05025 3 5.70017 3 9V15C3 18.2998 3 19.9497 4.02513 20.9749C5.05025 22 6.70017 22 10 22C10.3517 22 10.6846 22 11 21.9988" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M15.5 16.5V15C15.5 13.8954 16.3954 13 17.5 13C18.6046 13 19.5 13.8954 19.5 15V16.5M16.75 22H18.25C19.4228 22 20.0092 22 20.4131 21.69C20.5171 21.6102 20.6102 21.5171 20.69 21.4131C21 21.0092 21 20.4228 21 19.25C21 18.0772 21 17.4908 20.69 17.0869C20.6102 16.9829 20.5171 16.8898 20.4131 16.81C20.0092 16.5 19.4228 16.5 18.25 16.5H16.75C15.5772 16.5 14.9908 16.5 14.5869 16.81C14.4829 16.8898 14.3898 16.9829 14.31 17.0869C14 17.4908 14 18.0772 14 19.25C14 20.4228 14 21.0092 14.31 21.4131C14.3898 21.5171 14.4829 21.6102 14.5869 21.69C14.9908 22 15.5772 22 16.75 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10 19V19.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const MenuDots = (props) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...props}>
    <path fillRule="evenodd" clipRule="evenodd" d="M7 13.5C7.82843 13.5 8.5 12.8284 8.5 12C8.5 11.1716 7.82843 10.5 7 10.5C6.17157 10.5 5.5 11.1716 5.5 12C5.5 12.8284 6.17157 13.5 7 13.5ZM13.5 12C13.5 12.8284 12.8284 13.5 12 13.5C11.1716 13.5 10.5 12.8284 10.5 12C10.5 11.1716 11.1716 10.5 12 10.5C12.8284 10.5 13.5 11.1716 13.5 12ZM18.5 12C18.5 12.8284 17.8284 13.5 17 13.5C16.1716 13.5 15.5 12.8284 15.5 12C15.5 11.1716 16.1716 10.5 17 10.5C17.8284 10.5 18.5 11.1716 18.5 12Z" fill="currentColor" />
  </svg>
)

export const CaretDownSolid = (props) => (
  <svg width="12" height="12" viewBox="0 0 320 512" {...props}>
    <path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z" fill="currentColor" />
  </svg>
)

export const CaretUpSolid = (props) => (
  <svg width="12" height="12" viewBox="0 0 320 512" {...props}>
    <path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z" fill="currentColor" />
  </svg>
)

export const Plus = (props) => (
  <svg width="12" height="12" viewBox="0 0 12 12" {...props}>
    <path d="M7 0H5V5H0V7H5V12H7V7H12V5H7V0Z" fill="currentColor" />
  </svg>
)

export const Eye = (props) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...props}>
    <path fillRule="evenodd" clipRule="evenodd" d="M15.1278 12C15.1278 13.6863 13.7274 15.0533 12 15.0533C10.2726 15.0533 8.8722 13.6863 8.8722 12C8.8722 10.3137 10.2726 8.94664 12 8.94664C13.7274 8.94664 15.1278 10.3137 15.1278 12ZM13.3717 12C13.3717 12.7395 12.7576 13.339 12 13.339C11.2424 13.339 10.6283 12.7395 10.6283 12C10.6283 11.2604 11.2424 10.6609 12 10.6609C12.7576 10.6609 13.3717 11.2604 13.3717 12Z" fill="currentColor" />
    <path fillRule="evenodd" clipRule="evenodd" d="M12 18C7.90486 18 4.40498 15.512 3 12C4.40498 8.48798 7.90475 6 11.9999 6C16.095 6 19.595 8.48798 21 12C19.595 15.512 16.0951 18 12 18ZM11.9999 7.71429C15.1026 7.71429 17.7877 9.45991 19.0808 12C17.7877 14.5401 15.1027 16.2857 12 16.2857C8.89726 16.2857 6.21206 14.5401 4.91897 12C6.21206 9.45991 8.89715 7.71429 11.9999 7.71429Z" fill="currentColor" />
  </svg>
)

export const EyeClosed = (props) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...props}>
    <path d="M3 12C3.34629 12.8656 3.81984 13.669 4.3982 14.3883L3.1051 15.6814L4.51932 17.0956L5.80754 15.8074C6.60111 16.4553 7.50288 16.9811 8.48252 17.3552L8.01453 19.1018L9.94638 19.6194L10.4142 17.8735C10.9301 17.9567 11.4599 18 12 18C12.5413 18 13.0722 17.9565 13.5892 17.873L14.0572 19.6194L15.989 19.1018L15.5207 17.354C16.4999 16.9796 17.4012 16.4537 18.1944 15.8058L19.4842 17.0956L20.8984 15.6814L19.6034 14.3863C20.181 13.6676 20.654 12.8648 21 12H19.0808C17.7877 14.5401 15.1027 16.2857 12 16.2857C8.89725 16.2857 6.21206 14.5401 4.91897 12H3Z" fill="currentColor" />
  </svg>
)

// Shape Icons
export const Fill = (props) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...props}>
    <path fillRule="evenodd" clipRule="evenodd" d="M18.6289 16.4087C18.7672 16.1958 18.7885 15.9274 18.6854 15.6954L14.6854 6.6954C14.5242 6.3327 14.1083 6.15839 13.7367 6.29775L5.73666 9.29775C5.44393 9.40753 5.25 9.68737 5.25 10L5.25 16C5.25 16.4142 5.58578 16.75 6 16.75L18 16.75C18.2539 16.75 18.4905 16.6216 18.6289 16.4087ZM16.8459 15.25L6.75 15.25L6.75 10.5197L13.6017 7.95038L16.8459 15.25Z" fill="currentColor" />
  </svg>
)

export const Circle = (props) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...props}>
    <path fillRule="evenodd" clipRule="evenodd" d="M12 14.5C13.3807 14.5 14.5 13.3807 14.5 12C14.5 10.6193 13.3807 9.5 12 9.5C10.6193 9.5 9.5 10.6193 9.5 12C9.5 13.3807 10.6193 14.5 12 14.5ZM12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" fill="currentColor" />
  </svg>
)

export const Line = (props) => (
  <svg width="20" height="20" viewBox="0 0 24 24" {...props}>
    <path fillRule="evenodd" clipRule="evenodd" d="M6.75146 15.1306V15.1306C6.7516 15.5448 6.41592 15.8807 6.0017 15.8808C5.58749 15.881 5.2516 15.5453 5.25146 15.1311C5.25142 14.9906 5.29183 13.8577 5.72195 12.7308C6.15161 11.6052 7.07875 10.2542 8.93625 10.2542C10.6713 10.2542 11.7208 10.8779 12.6242 11.4218L12.6343 11.4279C13.5029 11.9509 14.2064 12.3744 15.4163 12.3744C15.9048 12.3744 16.2194 12.1925 16.4573 11.9172C16.7183 11.6151 16.9063 11.1726 17.0283 10.6575C17.1484 10.1509 17.1911 9.63239 17.2023 9.23237C17.2078 9.03445 17.2055 8.87034 17.2019 8.75742C17.2001 8.70106 17.198 8.65774 17.1964 8.62967L17.1946 8.59935L17.1942 8.59372C17.1628 8.18088 17.4718 7.82024 17.8847 7.78861C18.2977 7.75696 18.6582 8.06611 18.6898 8.47911L17.942 8.53641C18.6898 8.47911 18.6898 8.47911 18.6898 8.47911L18.69 8.48178L18.6903 8.48614L18.6913 8.4998L18.6941 8.54621C18.6963 8.58534 18.6989 8.64059 18.7011 8.70969C18.7055 8.84767 18.7082 9.042 18.7017 9.27419C18.6888 9.73442 18.6397 10.3629 18.4879 11.0033C18.3382 11.6352 18.0746 12.3396 17.5923 12.8979C17.0869 13.4828 16.3665 13.8744 15.4163 13.8744C13.7881 13.8744 12.7801 13.267 11.9056 12.74C11.8871 12.7289 11.8688 12.7179 11.8505 12.7068C10.993 12.1906 10.2412 11.7542 8.93625 11.7542C8.00391 11.7542 7.46363 12.3742 7.12334 13.2657C6.95675 13.7022 6.86216 14.1544 6.80996 14.5155C6.78413 14.6942 6.76931 14.8461 6.76102 14.9566C6.75321 15.0608 6.75168 15.1221 6.75146 15.1306Z" fill="currentColor" />
  </svg>
)

export const Login = (props) => (
  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" {...props}>
   <path d="M12 8L16 12M16 12L12 16M16 12H3M3.33782 7C5.06687 4.01099 8.29859 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C8.29859 22 5.06687 19.989 3.33782 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
   </svg>
)

// Hazard/Weather Icons
export { riverine, snowflake, tsunami, coastal, drought, hurricane, earthquake, coldwave, heatwave, hail, snowstorm, ice, lightning, tornado, fire, wind, landslide, volcano } from './hazard_icons'
