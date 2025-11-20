import React from 'react'

const PencilEditSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M16.2141 4.98239L17.6158 3.58063C18.39 2.80646 19.6452 2.80646 20.4194 3.58063C21.1935 4.3548 21.1935 5.60998 20.4194 6.38415L19.0176 7.78591M16.2141 4.98239L10.9802 10.2163C9.93493 11.2616 9.41226 11.7842 9.05637 12.4211C8.70047 13.058 8.3424 14.5619 8 16C9.43809 15.6576 10.942 15.2995 11.5789 14.9436C12.2158 14.5877 12.7384 14.0651 13.7837 13.0198L19.0176 7.78591M16.2141 4.98239L19.0176 7.78591" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 12C21 16.2426 21 18.364 19.682 19.682C18.364 21 16.2426 21 12 21C7.75736 21 5.63604 21 4.31802 19.682C3 18.364 3 16.2426 3 12C3 7.75736 3 5.63604 4.31802 4.31802C5.63604 3 7.75736 3 12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ViewIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M21.544 11.045C21.848 11.4713 22 11.6845 22 12C22 12.3155 21.848 12.5287 21.544 12.955C20.1779 14.8706 16.6892 19 12 19C7.31078 19 3.8221 14.8706 2.45604 12.955C2.15201 12.5287 2 12.3155 2 12C2 11.6845 2.15201 11.4713 2.45604 11.045C3.8221 9.12944 7.31078 5 12 5C16.6892 5 20.1779 9.12944 21.544 11.045Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15C13.6569 15 15 13.6569 15 12Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const PencilIcon = ({size=24, className}) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={"none"} className={className}>
    <path d="M15.2141 5.98239L16.6158 4.58063C17.39 3.80646 18.6452 3.80646 19.4194 4.58063C20.1935 5.3548 20.1935 6.60998 19.4194 7.38415L18.0176 8.78591M15.2141 5.98239L6.98023 14.2163C5.93493 15.2616 5.41226 15.7842 5.05637 16.4211C4.70047 17.058 4.3424 18.5619 4 20C5.43809 19.6576 6.94199 19.2995 7.57889 18.9436C8.21579 18.5877 8.73844 18.0651 9.78375 17.0198L18.0176 8.78591M15.2141 5.98239L18.0176 8.78591" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11 20H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CirclePlus = ({ className, ...props}) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const SquarePlus = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M12 8V16M16 12H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WrenchIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M20.3584 13.3567C19.1689 14.546 16.9308 14.4998 13.4992 14.4998C11.2914 14.4998 9.50138 12.7071 9.50024 10.4993C9.50024 7.07001 9.454 4.83065 10.6435 3.64138C11.8329 2.45212 12.3583 2.50027 17.6274 2.50027C18.1366 2.49809 18.3929 3.11389 18.0329 3.47394L15.3199 6.18714C14.6313 6.87582 14.6294 7.99233 15.3181 8.68092C16.0068 9.36952 17.1234 9.36959 17.8122 8.68109L20.5259 5.96855C20.886 5.60859 21.5019 5.86483 21.4997 6.37395C21.4997 11.6422 21.5479 12.1675 20.3584 13.3567Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M13.5 14.5L7.32842 20.6716C6.22386 21.7761 4.433 21.7761 3.32843 20.6716C2.22386 19.567 2.22386 17.7761 3.32843 16.6716L9.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5.50896 18.5H5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SlidersIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
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
);

const MenuIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M4 4.5L20 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 14.5L20 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 9.5L20 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 19.5L20 19.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ClockIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M12 22C6.47711 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.4776 2 20.2257 4.94289 21.5 9H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8V12L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21.9551 13C21.9848 12.6709 22 12.3373 22 12M15 22C15.3416 21.8876 15.6753 21.7564 16 21.6078M20.7906 17C20.9835 16.6284 21.1555 16.2433 21.305 15.8462M18.1925 20.2292C18.5369 19.9441 18.8631 19.6358 19.1688 19.3065" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InfoCircle = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12.2422 17V12C12.2422 11.5286 12.2422 11.2929 12.0957 11.1464C11.9493 11 11.7136 11 11.2422 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.992 8H12.001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TrashCan = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M19.5 5.5L18.8803 15.5251C18.7219 18.0864 18.6428 19.3671 18.0008 20.2879C17.6833 20.7431 17.2747 21.1273 16.8007 21.416C15.8421 22 14.559 22 11.9927 22C9.42312 22 8.1383 22 7.17905 21.4149C6.7048 21.1257 6.296 20.7408 5.97868 20.2848C5.33688 19.3626 5.25945 18.0801 5.10461 15.5152L4.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M3 5.5H21M16.0557 5.5L15.3731 4.09173C14.9196 3.15626 14.6928 2.68852 14.3017 2.39681C14.215 2.3321 14.1231 2.27454 14.027 2.2247C13.5939 2 13.0741 2 12.0345 2C10.9688 2 10.436 2 9.99568 2.23412C9.8981 2.28601 9.80498 2.3459 9.71729 2.41317C9.32164 2.7167 9.10063 3.20155 8.65861 4.17126L8.05292 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9.5 16.5L9.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M14.5 16.5L14.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const RemoveCircle = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M16 12L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4.64856 5.07876C4.78691 4.93211 4.92948 4.7895 5.0761 4.65111M7.94733 2.72939C8.12884 2.6478 8.31313 2.57128 8.5 2.5M2.73172 7.94192C2.64925 8.12518 2.57195 8.31127 2.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CancelCircle = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} fill={"none"} {...props}>
    <path d="M2.75 12C2.75 17.5228 7.22715 22 12.75 22C18.2728 22 22.75 17.5228 22.75 12C22.75 6.47714 18.2728 1.99998 12.75 1.99998" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M5.39856 5.07874C5.53691 4.9321 5.67948 4.78948 5.8261 4.65109M8.69733 2.72938C8.87884 2.64779 9.06313 2.57126 9.25 2.49998M3.48172 7.94191C3.39925 8.12517 3.32195 8.31126 3.25 8.49999" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15.75 9L12.75 12M12.75 12L9.75 15M12.75 12L15.75 15M12.75 12L9.75 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const FloppyDisk = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M8 22V19C8 17.1144 8 16.1716 8.58579 15.5858C9.17157 15 10.1144 15 12 15C13.8856 15 14.8284 15 15.4142 15.5858C16 16.1716 16 17.1144 16 19V22" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10 7H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3 11.8584C3 7.28199 3 4.99376 4.38674 3.54394C4.43797 3.49038 4.49038 3.43797 4.54394 3.38674C5.99376 2 8.28199 2 12.8584 2C13.943 2 14.4655 2.00376 14.9628 2.18936C15.4417 2.3681 15.8429 2.70239 16.6452 3.37099L18.8411 5.20092C19.9027 6.08561 20.4335 6.52795 20.7168 7.13266C21 7.73737 21 8.42833 21 9.81025V13C21 16.7497 21 18.6246 20.0451 19.9389C19.7367 20.3634 19.3634 20.7367 18.9389 21.0451C17.6246 22 15.7497 22 12 22C8.25027 22 6.3754 22 5.06107 21.0451C4.6366 20.7367 4.26331 20.3634 3.95491 19.9389C3 18.6246 3 16.7497 3 13V11.8584Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const CirclePlusDot = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M4.64856 5.07876C4.7869 4.93211 4.92948 4.7895 5.0761 4.65111M7.94733 2.72939C8.12884 2.6478 8.31313 2.57128 8.5 2.5M2.5 8.5C2.57195 8.31127 2.64925 8.12518 2.73172 7.94192" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8V16M16 12L8 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PencilSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M16.2141 4.98239L17.6158 3.58063C18.39 2.80646 19.6452 2.80646 20.4194 3.58063C21.1935 4.3548 21.1935 5.60998 20.4194 6.38415L19.0176 7.78591M16.2141 4.98239L10.9802 10.2163C9.93493 11.2616 9.41226 11.7842 9.05637 12.4211C8.70047 13.058 8.3424 14.5619 8 16C9.43809 15.6576 10.942 15.2995 11.5789 14.9436C12.2158 14.5877 12.7384 14.0651 13.7837 13.0198L19.0176 7.78591M16.2141 4.98239L19.0176 7.78591" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 12C21 16.2426 21 18.364 19.682 19.682C18.364 21 16.2426 21 12 21C7.75736 21 5.63604 21 4.31802 19.682C3 18.364 3 16.2426 3 12C3 7.75736 3 5.63604 4.31802 4.31802C5.63604 3 7.75736 3 12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ArrowDownSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M9.5 13.5C9.99153 14.0057 11.2998 16 12 16M14.5 13.5C14.0085 14.0057 12.7002 16 12 16M12 16V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const ArrowUpSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M9.5 10.5C9.99153 9.9943 11.2998 8 12 8M14.5 10.5C14.0085 9.9943 12.7002 8 12 8M12 8V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const ChevronDownSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M17 10C17 10 13.3176 14 12 14C10.6824 14 7 10 7 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ChevronUpSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M17 14C17 14 13.3176 10 12 10C10.6824 9.99999 7 14 7 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InfoSquare = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M2.5 12C2.5 7.52166 2.5 5.28249 3.89124 3.89124C5.28249 2.5 7.52166 2.5 12 2.5C16.4783 2.5 18.7175 2.5 20.1088 3.89124C21.5 5.28249 21.5 7.52166 21.5 12C21.5 16.4783 21.5 18.7175 20.1088 20.1088C18.7175 21.5 16.4783 21.5 12 21.5C7.52166 21.5 5.28249 21.5 3.89124 20.1088C2.5 18.7175 2.5 16.4783 2.5 12Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12.2422 17V12C12.2422 11.5286 12.2422 11.2929 12.0957 11.1464C11.9493 11 11.7136 11 11.2422 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.992 8H12.001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MoreSquare= (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M11.992 12H12.001" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.9842 16H11.9932" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M11.9998 8H12.0088" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.48438 12C2.48438 7.52166 2.48438 5.28249 3.87562 3.89124C5.26686 2.5 7.50603 2.5 11.9844 2.5C16.4627 2.5 18.7019 2.5 20.0931 3.89124C21.4844 5.28249 21.4844 7.52166 21.4844 12C21.4844 16.4783 21.4844 18.7175 20.0931 20.1088C18.7019 21.5 16.4627 21.5 11.9844 21.5C7.50603 21.5 5.26686 21.5 3.87562 20.1088C2.48438 18.7175 2.48438 16.4783 2.48438 12Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const UserCircle = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M12 2C17.5237 2 22 6.47778 22 12C22 17.5222 17.5237 22 12 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 21.5C7.81163 21.0953 6.69532 20.5107 5.72302 19.7462M5.72302 4.25385C6.69532 3.50059 7.81163 2.90473 9 2.5M2 10.2461C2.21607 9.08813 2.66019 7.96386 3.29638 6.94078M2 13.7539C2.21607 14.9119 2.66019 16.0361 3.29638 17.0592" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 16.5C10.0726 14.302 13.9051 14.1986 16 16.5M14.2179 9.75C14.2179 10.9926 13.2215 12 11.9925 12C10.7634 12 9.76708 10.9926 9.76708 9.75C9.76708 8.50736 10.7634 7.5 11.9925 7.5C13.2215 7.5 14.2179 8.50736 14.2179 9.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);


const User = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"#fff"} {...props}>
    <path d="M6.57757 15.4816C5.1628 16.324 1.45336 18.0441 3.71266 20.1966C4.81631 21.248 6.04549 22 7.59087 22H16.4091C17.9545 22 19.1837 21.248 20.2873 20.1966C22.5466 18.0441 18.8372 16.324 17.4224 15.4816C14.1048 13.5061 9.89519 13.5061 6.57757 15.4816Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M16.5 6.5C16.5 8.98528 14.4853 11 12 11C9.51472 11 7.5 8.98528 7.5 6.5C7.5 4.01472 9.51472 2 12 2C14.4853 2 16.5 4.01472 16.5 6.5Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const Tags = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <circle cx="1.5" cy="1.5" r="1.5" transform="matrix(1 0 0 -1 16 8)" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2.77423 11.1439C1.77108 12.2643 1.7495 13.9546 2.67016 15.1437C4.49711 17.5033 6.49674 19.5029 8.85633 21.3298C10.0454 22.2505 11.7357 22.2289 12.8561 21.2258C15.8979 18.5022 18.6835 15.6559 21.3719 12.5279C21.6377 12.2187 21.8039 11.8397 21.8412 11.4336C22.0062 9.63798 22.3452 4.46467 20.9403 3.05974C19.5353 1.65481 14.362 1.99377 12.5664 2.15876C12.1603 2.19608 11.7813 2.36233 11.472 2.62811C8.34412 5.31646 5.49781 8.10211 2.77423 11.1439Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 14L10 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowUp = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M17.9998 15C17.9998 15 13.5809 9.00001 11.9998 9C10.4187 8.99999 5.99985 15 5.99985 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const ArrowDown = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Copy = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill={"none"} {...props}>
        <title>{props.title}</title>
        <path
            d="M16.9637 8.98209C16.9613 6.03194 16.9167 4.50384 16.0578 3.45753C15.892 3.25546 15.7067 3.07019 15.5047 2.90436C14.4008 1.99854 12.7609 1.99854 9.48087 1.99854C6.20089 1.99854 4.5609 1.99854 3.45708 2.90436C3.255 3.07018 3.06971 3.25546 2.90387 3.45753C1.99799 4.56128 1.99799 6.20116 1.99799 9.48091C1.99799 12.7607 1.99799 14.4005 2.90387 15.5043C3.0697 15.7063 3.255 15.8916 3.45708 16.0574C4.50346 16.9162 6.03167 16.9608 8.98201 16.9632"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path
            d="M14.0283 9.02455L16.994 8.98193M14.0143 22.0013L16.9799 21.9586M21.9716 14.0221L21.9436 16.9818M9.01033 14.0357L8.98236 16.9953M11.4873 9.02455C10.6545 9.17371 9.31781 9.32713 9.01033 11.0488M19.4946 21.9586C20.3296 21.8223 21.6685 21.6894 22.0025 19.9726M19.4946 9.02455C20.3274 9.17371 21.6641 9.32713 21.9716 11.0488M11.5 21.9573C10.6672 21.8086 9.33039 21.6559 9.02197 19.9344"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const Download = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill={"none"} {...props}>
        <title>{props.title}</title>
        <path d="M12 14.5L12 4.5M12 14.5C11.2998 14.5 9.99153 12.5057 9.5 12M12 14.5C12.7002 14.5 14.0085 12.5057 14.5 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 16.5C20 18.982 19.482 19.5 17 19.5H7C4.518 19.5 4 18.982 4 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const LoadingHourGlass = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} color={"#000000"} fill={"none"} {...props}>
        <path d="M17.2014 2H6.79876C5.341 2 4.06202 2.9847 4.0036 4.40355C3.93009 6.18879 5.18564 7.37422 6.50435 8.4871C8.32861 10.0266 9.24075 10.7964 9.33642 11.7708C9.35139 11.9233 9.35139 12.0767 9.33642 12.2292C9.24075 13.2036 8.32862 13.9734 6.50435 15.5129C5.14932 16.6564 3.9263 17.7195 4.0036 19.5964C4.06202 21.0153 5.341 22 6.79876 22L17.2014 22C18.6591 22 19.9381 21.0153 19.9965 19.5964C20.043 18.4668 19.6244 17.342 18.7352 16.56C18.3298 16.2034 17.9089 15.8615 17.4958 15.5129C15.6715 13.9734 14.7594 13.2036 14.6637 12.2292C14.6487 12.0767 14.6487 11.9233 14.6637 11.7708C14.7594 10.7964 15.6715 10.0266 17.4958 8.4871C18.8366 7.35558 20.0729 6.25809 19.9965 4.40355C19.9381 2.9847 18.6591 2 17.2014 2Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M9 21.6381C9 21.1962 9 20.9752 9.0876 20.7821C9.10151 20.7514 9.11699 20.7214 9.13399 20.6923C9.24101 20.509 9.42211 20.3796 9.78432 20.1208C10.7905 19.4021 11.2935 19.0427 11.8652 19.0045C11.955 18.9985 12.045 18.9985 12.1348 19.0045C12.7065 19.0427 13.2095 19.4021 14.2157 20.1208C14.5779 20.3796 14.759 20.509 14.866 20.6923C14.883 20.7214 14.8985 20.7514 14.9124 20.7821C15 20.9752 15 21.1962 15 21.6381V22H9V21.6381Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);
const Filter = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={20} height={20} color={"#000000"} fill={"none"} {...props}>
        <title>{props.title}</title>
        <path d="M8.85746 12.5061C6.36901 10.6456 4.59564 8.59915 3.62734 7.44867C3.3276 7.09253 3.22938 6.8319 3.17033 6.3728C2.96811 4.8008 2.86701 4.0148 3.32795 3.5074C3.7889 3 4.60404 3 6.23433 3H17.7657C19.396 3 20.2111 3 20.672 3.5074C21.133 4.0148 21.0319 4.8008 20.8297 6.37281C20.7706 6.83191 20.6724 7.09254 20.3726 7.44867C19.403 8.60062 17.6261 10.6507 15.1326 12.5135C14.907 12.6821 14.7583 12.9567 14.7307 13.2614C14.4837 15.992 14.2559 17.4876 14.1141 18.2442C13.8853 19.4657 12.1532 20.2006 11.226 20.8563C10.6741 21.2466 10.0043 20.782 9.93278 20.1778C9.79643 19.0261 9.53961 16.6864 9.25927 13.2614C9.23409 12.9539 9.08486 12.6761 8.85746 12.5061Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const PDF = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} stroke="currentColor" fill={"none"} {...props}>
        <path d="M19 11C19 10.1825 19 9.4306 18.8478 9.06306C18.6955 8.69552 18.4065 8.40649 17.8284 7.82843L13.0919 3.09188C12.593 2.593 12.3436 2.34355 12.0345 2.19575C11.9702 2.165 11.9044 2.13772 11.8372 2.11401C11.5141 2 11.1614 2 10.4558 2C7.21082 2 5.58831 2 4.48933 2.88607C4.26731 3.06508 4.06508 3.26731 3.88607 3.48933C3 4.58831 3 6.21082 3 9.45584V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H19M12 2.5V3C12 5.82843 12 7.24264 12.8787 8.12132C13.7574 9 15.1716 9 18 9H18.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 14H19C18.4477 14 18 14.4477 18 15V16.5M18 16.5V19M18 16.5H20.5M7 19V17M7 17V14H8.5C9.32843 14 10 14.6716 10 15.5C10 16.3284 9.32843 17 8.5 17H7ZM12.5 14H13.7857C14.7325 14 15.5 14.7462 15.5 15.6667V17.3333C15.5 18.2538 14.7325 19 13.7857 19H12.5V14Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const Printer = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={18} height={18} stroke="currentColor" fill={"none"} {...props}>
        <path d="M7.35396 18C5.23084 18 4.16928 18 3.41349 17.5468C2.91953 17.2506 2.52158 16.8271 2.26475 16.3242C1.87179 15.5547 1.97742 14.5373 2.18868 12.5025C2.36503 10.8039 2.45321 9.95455 2.88684 9.33081C3.17153 8.92129 3.55659 8.58564 4.00797 8.35353C4.69548 8 5.58164 8 7.35396 8H16.646C18.4184 8 19.3045 8 19.992 8.35353C20.4434 8.58564 20.8285 8.92129 21.1132 9.33081C21.5468 9.95455 21.635 10.8039 21.8113 12.5025C22.0226 14.5373 22.1282 15.5547 21.7352 16.3242C21.4784 16.8271 21.0805 17.2506 20.5865 17.5468C19.8307 18 18.7692 18 16.646 18" stroke="currentColor" strokeWidth="1.5" />
        <path d="M17 8V6C17 4.11438 17 3.17157 16.4142 2.58579C15.8284 2 14.8856 2 13 2H11C9.11438 2 8.17157 2 7.58579 2.58579C7 3.17157 7 4.11438 7 6V8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M13.9887 16L10.0113 16C9.32602 16 8.98337 16 8.69183 16.1089C8.30311 16.254 7.97026 16.536 7.7462 16.9099C7.57815 17.1904 7.49505 17.5511 7.32884 18.2724C7.06913 19.3995 6.93928 19.963 7.02759 20.4149C7.14535 21.0174 7.51237 21.5274 8.02252 21.7974C8.40513 22 8.94052 22 10.0113 22L13.9887 22C15.0595 22 15.5949 22 15.9775 21.7974C16.4876 21.5274 16.8547 21.0174 16.9724 20.4149C17.0607 19.963 16.9309 19.3995 16.6712 18.2724C16.505 17.5511 16.4218 17.1904 16.2538 16.9099C16.0297 16.536 15.6969 16.254 15.3082 16.1089C15.0166 16 14.674 16 13.9887 16Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M18 12H18.009" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
const Add = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
        <path d="M12 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 12H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const XMark = ({className='size-6', ...props}) => (
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
)

const AdjustmentsHorizontal = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"  {...props}>
  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
</svg>

)

const LinkSquare = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} stroke="currentColor" fill={"none"} {...props}>
        <path d="M11.1004 3.00208C7.4515 3.00864 5.54073 3.09822 4.31962 4.31931C3.00183 5.63706 3.00183 7.75796 3.00183 11.9997C3.00183 16.2415 3.00183 18.3624 4.31962 19.6801C5.6374 20.9979 7.75836 20.9979 12.0003 20.9979C16.2421 20.9979 18.3631 20.9979 19.6809 19.6801C20.902 18.4591 20.9916 16.5484 20.9982 12.8996" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20.4803 3.51751L14.931 9.0515M20.4803 3.51751C19.9863 3.023 16.6587 3.0691 15.9552 3.0791M20.4803 3.51751C20.9742 4.01202 20.9282 7.34329 20.9182 8.04754" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const DraftPage = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={22} height={22} stroke="currentColor" fill={"none"} {...props}>
        <path d="M19.7502 11V10C19.7502 6.22876 19.7502 4.34315 18.5786 3.17157C17.407 2 15.5214 2 11.7502 2H10.7503C6.97907 2 5.09346 2 3.92189 3.17156C2.75032 4.34312 2.7503 6.22872 2.75027 9.99993L2.75024 14C2.7502 17.7712 2.75019 19.6568 3.92172 20.8284C5.09329 21.9999 6.97897 22 10.7502 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M7.25024 7H15.2502M7.25024 12H15.2502" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M13.2502 20.8268V22H14.4236C14.833 22 15.0377 22 15.2217 21.9238C15.4058 21.8475 15.5505 21.7028 15.84 21.4134L20.6636 16.5894C20.9366 16.3164 21.0731 16.1799 21.1461 16.0327C21.285 15.7525 21.285 15.4236 21.1461 15.1434C21.0731 14.9961 20.9366 14.8596 20.6636 14.5866C20.3905 14.3136 20.254 14.1771 20.1067 14.1041C19.8265 13.9653 19.4975 13.9653 19.2173 14.1041C19.0701 14.1771 18.9335 14.3136 18.6605 14.5866L18.6605 14.5866L13.8369 19.4106C13.5474 19.7 13.4027 19.8447 13.3265 20.0287C13.2502 20.2128 13.2502 20.4174 13.2502 20.8268Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
);

const ArrowLeft = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={22} height={22} stroke="currentColor" fill={"none"} {...props}>
        <path d="M15 6C15 6 9.00001 10.4189 9 12C8.99999 13.5812 15 18 15 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const ArrowRight = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={22} height={22} stroke="currentColor" fill={"none"} {...props}>
        <path d="M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const CaretDown = ({className='size-6', ...props}) => (
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
  </svg>
);

const CaretUp = ({className='size-6', ...props}) => (
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
  </svg>
);
const CircleCheck = ({className='size-6', ...props}) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </svg>
)
const CircleX = ({className='size-6', ...props}) => (
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} {...props}>
  <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
</svg>
)
const EllipsisVertical = ({className='size-6', ...props}) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
  </svg>
)
const TallyMark = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>
        <path d="M5 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M9 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M13 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M17 4V20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>

        <path d="M4 18L18 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
)

const LeftToRightListBullet = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>
        <path d="M8 5L20 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M4 5H4.00898" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 12H4.00898" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 19H4.00898" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 12L20 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M8 19L20 19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
);

const Sum = (props) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width={14}
        height={14}
        color="#000000"
        fill="none"
        {...props}
    >
        <path
            d="M19 17.14c0 1.5 0 2.25-.35 2.8-.18.29-.43.53-.72.71-.56.35-1.32.35-2.85.35H9.2c-2.59 0-3.88 0-4.15-.74-.27-.73.71-1.56 2.68-3.22l3.94-3.33c.94-.8 1.41-1.19 1.41-1.7 0-.52-.47-.91-1.41-1.71L7.72 6.96C5.75 5.3 4.77 4.47 5.05 3.73c.28-.73 1.57-.73 4.15-.73h5.89c1.53 0 2.3 0 2.85.34.29.18.54.43.72.72.35.55.35 1.31.35 2.81"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
        />
    </svg>
);

const Avg = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" color="#000000" fill="none" {...props} >
        <path d="M21 21H10C6.70017 21 5.05025 21 4.02513 19.9749C3 18.9497 3 17.2998 3 14V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 12H6.00898M8.9982 12H9.00718M11.9964 12H12.0054M14.9946 12H15.0036M17.9928 12H18.0018M20.991 12H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 7C6.67348 5.87847 7.58712 5 8.99282 5C14.9359 5 11.5954 17 17.9819 17C19.3976 17 20.3057 16.1157 21 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
)


const Group = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>

        <path d="M4 6H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M4 12H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M4 18H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>

        <path d="M19 4V8C19 9 20 10 21 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M19 20V16C19 15 20 14 21 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
)

const SortAsc = props => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"#fff"} {...props}>
        <path
            d="M4 14H8.42109C9.35119 14 9.81624 14 9.94012 14.2801C10.064 14.5603 9.74755 14.8963 9.11466 15.5684L5.47691 19.4316C4.84402 20.1037 4.52757 20.4397 4.65145 20.7199C4.77533 21 5.24038 21 6.17048 21H10"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 9L6.10557 4.30527C6.49585 3.43509 6.69098 3 7 3C7.30902 3 7.50415 3.43509 7.89443 4.30527L10 9"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17.5 20V4M17.5 20C16.7998 20 15.4915 18.0057 15 17.5M17.5 20C18.2002 20 19.5085 18.0057 20 17.5"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
)

const SortDesc = props => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"#fff"} {...props}>
        <path
            d="M4 3H8.42109C9.35119 3 9.81624 3 9.94012 3.28013C10.064 3.56026 9.74755 3.89632 9.11466 4.56842L5.47691 8.43158C4.84402 9.10368 4.52757 9.43974 4.65145 9.71987C4.77533 10 5.24038 10 6.17048 10H10"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 21L6.10557 16.3053C6.49585 15.4351 6.69098 15 7 15C7.30902 15 7.50415 15.4351 7.89443 16.3053L10 21"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M17.5 20V4M17.5 20C16.7998 20 15.4915 18.0057 15 17.5M17.5 20C18.2002 20 19.5085 18.0057 20 17.5"
              stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
)

const Search = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>
        <path d="M17.5 17.5L22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 11C20 6.02944 15.9706 2 11 2C6.02944 2 2 6.02944 2 11C2 15.9706 6.02944 20 11 20C15.9706 20 20 15.9706 20 11Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
);

// ---------------New Icons for UI Icon ---------------------------------------

const Default = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"  {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.25-8.25-3.286Zm0 13.036h.008v.008H12v-.008Z" />
  </svg>
);

const Settings = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
  </svg>
);

const Pages = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
);

 const History = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
    <path d="M12 22C6.47711 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.4776 2 20.2257 4.94289 21.5 9H19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8V12L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21.9551 13C21.9848 12.6709 22 12.3373 22 12M15 22C15.3416 21.8876 15.6753 21.7564 16 21.6078M20.7906 17C20.9835 16.6284 21.1555 16.2433 21.305 15.8462M18.1925 20.2292C18.5369 19.9441 18.8631 19.6358 19.1688 19.3065" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const Sections = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m0 0a2.246 2.246 0 0 0-.75-.128H5.25c-.263 0-.515.045-.75.128m15 0A2.25 2.25 0 0 1 21 12v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6c0-.98.626-1.813 1.5-2.122" />
  </svg>
)

 const Blank = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={24} height={24} stroke="currentColor" fill={"none"} {...props}>
  </svg>
);

const Brackets = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>
        <path d="M6 3C3.58901 4.93486 2 8.24345 2 12C2 15.7565 3.58901 19.0651 6 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 3C20.411 4.93486 22 8.24345 22 12C22 15.7565 20.411 19.0651 18 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const Divide = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>
        <path d="M3 12H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14.5 5.5C14.5 6.88071 13.3807 8 12 8C10.6193 8 9.5 6.88071 9.5 5.5C9.5 4.11929 10.6193 3 12 3C13.3807 3 14.5 4.11929 14.5 5.5Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="M14.5 18.5C14.5 19.8807 13.3807 21 12 21C10.6193 21 9.5 19.8807 9.5 18.5C9.5 17.1193 10.6193 16 12 16C13.3807 16 14.5 17.1193 14.5 18.5Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
);

const Multiplication = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>
        <path d="M18 6L12 12M12 12L6 18M12 12L18 18M12 12L6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const Minus = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>
        <path d="M20 12L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const Page = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42" fill="none" {...props}>
        <path d="M29.55 10.95L19.05 0.450044C18.918 0.303466 18.7558 0.18731 18.5745 0.109612C18.3932 0.0319142 18.1972 -0.00547053 18 4.40737e-05H3C2.20507 0.00237881 1.44336 0.319199 0.881259 0.881303C0.319155 1.44341 0.00233473 2.20511 0 3.00004V39C0.00233473 39.795 0.319155 40.5567 0.881259 41.1188C1.44336 41.6809 2.20507 41.9977 3 42H27C27.7949 41.9977 28.5566 41.6809 29.1187 41.1188C29.6808 40.5567 29.9977 39.795 30 39V12C30.0055 11.8029 29.9681 11.6069 29.8904 11.4256C29.8127 11.2443 29.6966 11.082 29.55 10.95ZM18 3.60004L26.4 12H18V3.60004ZM27 39H3V3.00004H15V12C15.0023 12.795 15.3192 13.5567 15.8813 14.1188C16.4434 14.6809 17.2051 14.9977 18 15H27V39Z" fill="#2D3E4C"/>
    </svg>
)

const Section = props => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" {...props}>
        <g clipPath="url(#clip0_2741_71019)">
            <path d="M38.55 13.95L28.05 3.45C27.75 3.15 27.45 3 27 3H12C10.35 3 9 4.35 9 6V42C9 43.65 10.35 45 12 45H36C37.65 45 39 43.65 39 42V15C39 14.55 38.85 14.25 38.55 13.95ZM27 6.6L35.4 15H27V6.6ZM36 42H12V6H24V15C24 16.65 25.35 18 27 18H36V42Z" fill="#2D3E4C"/>
            <path d="M15 33H33V36H15V33Z" fill="#2D3E4C"/>
            <path d="M15 24H33V27H15V24Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2741_71019">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const riverine = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_1928_10039)">
            <path d="M43.5 42.0001C42.9878 41.9988 42.4799 41.9066 42 41.7277V41.7188C41.297 41.4211 40.6617 40.984 40.1323 40.4339C39.603 39.8838 39.1907 39.2321 38.9202 38.5181C38.8254 38.2177 38.6358 37.956 38.3797 37.7725C38.1237 37.5889 37.815 37.4934 37.5 37.5001C37.1856 37.5016 36.8795 37.6013 36.6244 37.7851C36.3693 37.9689 36.1779 38.2277 36.077 38.5255C35.7449 39.4934 35.1324 40.3407 34.3174 40.9595C33.5023 41.5782 32.5216 41.9405 31.5 42.0001C30.4772 41.94 29.4954 41.5767 28.6798 40.9566C27.8642 40.3365 27.2516 39.4876 26.9202 38.5181C26.8216 38.22 26.631 37.9609 26.3758 37.7779C26.1206 37.595 25.814 37.4977 25.5 37.5001C25.1856 37.5016 24.8795 37.6013 24.6244 37.7851C24.3693 37.9689 24.1779 38.2277 24.077 38.5255C23.7449 39.4934 23.1324 40.3407 22.3174 40.9595C21.5023 41.5782 20.5216 41.9405 19.5 42.0001C18.4772 41.94 17.4954 41.5767 16.6798 40.9566C15.8642 40.3365 15.2516 39.4876 14.9202 38.5181C14.8192 38.2207 14.6275 37.9625 14.3719 37.7799C14.1164 37.5973 13.81 37.4995 13.4959 37.5003C13.1819 37.5011 12.876 37.6005 12.6214 37.7844C12.3668 37.9684 12.1764 38.2276 12.077 38.5255C11.7449 39.4934 11.1324 40.3407 10.3174 40.9595C9.5023 41.5782 8.52157 41.9405 7.5 42.0001H3V45.0001H7.5C8.66412 45.0104 9.81423 44.7458 10.8568 44.2278C11.8994 43.7098 12.805 42.9531 13.5 42.0191C14.2021 42.9455 15.1092 43.6966 16.1501 44.2138C17.1911 44.731 18.3377 45.0001 19.5 45.0001C20.6623 45.0001 21.8089 44.731 22.8499 44.2138C23.8908 43.6966 24.7979 42.9455 25.5 42.0191C26.2021 42.9455 27.1092 43.6966 28.1501 44.2138C29.1911 44.731 30.3377 45.0001 31.5 45.0001C32.6623 45.0001 33.8089 44.731 34.8499 44.2138C35.8908 43.6966 36.7979 42.9455 37.5 42.0191C38.3352 43.0985 39.4418 43.937 40.7068 44.4491C41.5924 44.8154 42.5417 45.0027 43.5 45.0001H45V42.0001H43.5Z" fill="#2D3E4C"/>
            <path d="M42 20.445L44.6359 22.5L46.5 20.1423L24.9184 3.32086C24.6523 3.11294 24.3242 3 23.9864 3C23.6487 3 23.3206 3.11294 23.0544 3.32086L1.5 20.1291L3.36405 22.4868L6 20.4317V28.2129C5.72241 28.8867 5.3145 29.4991 4.79969 30.0149C4.28488 30.5308 3.67328 30.9399 3 31.2188V34.344C4.79468 33.9836 6.39538 32.9787 7.5 31.5191C8.20212 32.4454 9.10919 33.1965 10.1501 33.7137C11.1911 34.2309 12.3377 34.5 13.5 34.5C14.6623 34.5 15.8089 34.2309 16.8499 33.7137C17.8908 33.1965 18.7979 32.4454 19.5 31.5191C20.2021 32.4454 21.1092 33.1965 22.1501 33.7137C23.1911 34.2309 24.3377 34.5 25.5 34.5C26.6623 34.5 27.8089 34.2309 28.8499 33.7137C29.8908 33.1965 30.7979 32.4454 31.5 31.5191C32.195 32.453 33.1006 33.2097 34.1432 33.7277C35.1858 34.2457 36.3359 34.5103 37.5 34.5H45V31.5H42V20.445ZM32.923 28.0248C32.8236 27.7269 32.6332 27.4677 32.3786 27.2838C32.124 27.0998 31.8181 27.0005 31.5041 26.9996C31.19 26.9988 30.8836 27.0966 30.6281 27.2792C30.3725 27.4618 30.1808 27.7201 30.0798 28.0175C29.7485 28.9871 29.136 29.8361 28.3203 30.4563C27.5047 31.0765 26.5229 31.4398 25.5 31.5C24.4784 31.4404 23.4977 31.0781 22.6826 30.4594C21.8676 29.8406 21.2551 28.9934 20.923 28.0254C20.8221 27.7276 20.6307 27.4688 20.3756 27.285C20.1205 27.1012 19.8144 27.0016 19.5 27C19.186 26.9976 18.8794 27.0949 18.6242 27.2779C18.369 27.4608 18.1784 27.7199 18.0798 28.0181C17.7484 28.9876 17.1358 29.8364 16.3202 30.4565C15.5046 31.0766 14.5228 31.4399 13.5 31.5C12.51 31.4542 11.5554 31.1183 10.7547 30.5343C9.9541 29.9502 9.3428 29.1437 8.99685 28.215L9 18.0923L23.9865 6.40726L39 18.1077L39.0025 31.5H37.5C36.4784 31.4404 35.4977 31.0781 34.6826 30.4594C33.8676 29.8406 33.2551 28.9928 32.923 28.0248Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_1928_10039">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const snowflake = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_1928_10333)">
            <path d="M32.1222 18H42V15H35.1222L42.0008 8.1219L39.8796 6L33 12.8804V6H30V15.8804L27.8801 18H25.5V12H22.5V18H20.1199L18 15.8804V6H15V12.8804L8.1204 6L6 8.1219L12.8778 15H6V18H15.8778L18 20.1225V22.5H12V25.5H18V27.8804L15.88 30H6V33H12.88L6 39.8796L8.12115 42.0008L15 35.1225V42H18V32.1225L20.1222 30H22.5V36H25.5V30H27.8778L30 32.1225V42H33V35.1225L39.8781 42.0008L42 39.8796L35.1199 33H42V30H32.1199L30 27.8804V25.5H36V22.5H30V20.1225L32.1222 18ZM27 27H21V21H27V27Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_1928_10333">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const tsunami = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_1928_10333)">
            <path d="M32.1222 18H42V15H35.1222L42.0008 8.1219L39.8796 6L33 12.8804V6H30V15.8804L27.8801 18H25.5V12H22.5V18H20.1199L18 15.8804V6H15V12.8804L8.1204 6L6 8.1219L12.8778 15H6V18H15.8778L18 20.1225V22.5H12V25.5H18V27.8804L15.88 30H6V33H12.88L6 39.8796L8.12115 42.0008L15 35.1225V42H18V32.1225L20.1222 30H22.5V36H25.5V30H27.8778L30 32.1225V42H33V35.1225L39.8781 42.0008L42 39.8796L35.1199 33H42V30H32.1199L30 27.8804V25.5H36V22.5H30V20.1225L32.1222 18ZM27 27H21V21H27V27Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_1928_10333">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)
const coastal = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_1928_10437)">
            <path d="M37.1712 39.0002L38.955 31.8635C39.0102 31.6424 39.0143 31.4116 38.967 31.1887C38.9196 30.9658 38.8222 30.7566 38.6819 30.577C38.5417 30.3974 38.3623 30.2521 38.1575 30.1521C37.9528 30.0522 37.7279 30.0002 37.5 30.0002H30V25.5002H37.5C37.7517 25.5002 37.9994 25.4369 38.2202 25.3161C38.441 25.1953 38.6279 25.0208 38.7636 24.8088C38.8993 24.5968 38.9795 24.3541 38.9967 24.1029C39.014 23.8518 38.9677 23.6004 38.8623 23.3718L29.8623 3.87182C29.754 3.63725 29.587 3.4346 29.3774 3.28349C29.1679 3.13238 28.9229 3.03793 28.6661 3.00927C28.4093 2.9806 28.1495 3.01871 27.9118 3.11989C27.6741 3.22107 27.4665 3.3819 27.3092 3.58682L12.3112 23.0861C12.1406 23.3081 12.0355 23.5735 12.0079 23.8521C11.9802 24.1308 12.0311 24.4116 12.1548 24.6628C12.2786 24.914 12.4701 25.1256 12.7078 25.2736C12.9456 25.4216 13.22 25.5001 13.5 25.5002H27V30.0002H10.5C10.2721 30.0002 10.0472 30.0522 9.84246 30.1521C9.63767 30.2521 9.45834 30.3974 9.31809 30.577C9.17784 30.7566 9.08035 30.9658 9.03303 31.1887C8.98572 31.4116 8.98981 31.6424 9.045 31.8635L10.8288 39.0002H3V42.0002H45V39.0002H37.1712ZM30 11.3292L35.1555 22.5002H30V11.3292ZM16.5462 22.5002L27 8.91017V22.5002H16.5462ZM34.0788 39.0002H13.9212L12.4212 33.0002H35.5788L34.0788 39.0002Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_1928_10437">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>

)

const drought = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_1928_10464)">
            <path d="M40.5 26.9998H45V22.4998C44.9982 20.909 44.3655 19.3839 43.2407 18.2591C42.1158 17.1343 40.5908 16.5016 39 16.4998H37.5V14.2498C37.4983 12.8579 36.9447 11.5235 35.9605 10.5393C34.9763 9.5551 33.6419 9.00144 32.25 8.99978C31.4699 9.00378 30.7008 9.1838 30 9.52643V8.11478C30.0005 6.93636 29.5941 5.7939 28.8495 4.88054C28.1049 3.96718 27.0677 3.33894 25.9134 3.10201C24.759 2.86509 23.5583 3.03401 22.5141 3.58024C21.4699 4.12646 20.6464 5.01647 20.1826 6.09983L17.0112 13.4998H13.5C11.5116 13.5021 9.6053 14.293 8.19929 15.6991C6.79327 17.1051 6.00234 19.0114 6 20.9998V26.9998H12C13.9884 26.9974 15.8947 26.2065 17.3007 24.8005C18.7067 23.3945 19.4977 21.4882 19.5 19.4998V15.3074L22.9395 7.28243C23.1308 6.83384 23.4712 6.46514 23.9032 6.23875C24.3351 6.01236 24.832 5.94219 25.3097 6.04012C25.7875 6.13804 26.2167 6.39806 26.5247 6.77613C26.8327 7.1542 27.0006 7.62711 27 8.11478V32.9998H21.9184L16.5 37.9406L11.0815 32.9998H3V35.9998H9.91845L16.5 41.9998L23.0816 35.9998H45V32.9998H30V14.2498C30 13.653 30.2371 13.0807 30.659 12.6588C31.081 12.2368 31.6533 11.9998 32.25 11.9998C32.8467 11.9998 33.419 12.2368 33.841 12.6588C34.2629 13.0807 34.5 13.653 34.5 14.2498V20.9998C34.5018 22.5905 35.1345 24.1156 36.2593 25.2404C37.3842 26.3653 38.9092 26.998 40.5 26.9998ZM37.5 19.4998H39C39.7954 19.5007 40.5579 19.8171 41.1203 20.3795C41.6827 20.9419 41.9991 21.7044 42 22.4998V23.9998H40.5C39.7046 23.9989 38.9421 23.6825 38.3797 23.1201C37.8173 22.5577 37.5009 21.7951 37.5 20.9998V19.4998ZM16.5 19.4998C16.4987 20.6928 16.0242 21.8367 15.1805 22.6803C14.3369 23.5239 13.1931 23.9985 12 23.9998H9V20.9998C9.00131 19.8067 9.47584 18.6629 10.3195 17.8192C11.1631 16.9756 12.3069 16.5011 13.5 16.4998H16.5V19.4998Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_1928_10464">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const hurricane = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_1939_11803)">
            <path d="M33.9782 6.27315L30.7127 10.0444L28.607 12.4761L31.1797 14.4075C32.6773 15.5177 33.8933 16.9642 34.7296 18.6303C35.5659 20.2965 35.9992 22.1357 35.9945 24L35.9957 24.0864L35.9983 24.1486C36.0253 24.7962 36.3601 39.3156 14.0176 41.7319L17.2876 37.9556L19.3934 35.5239L16.8209 33.5925C15.3232 32.4823 14.1072 31.0359 13.2708 29.3698C12.4344 27.7036 12.0011 25.8643 12.0056 24L12.0044 23.9136L12.0019 23.8514C11.9749 23.205 11.6408 8.71065 33.9782 6.27315ZM37.4968 3C37.4722 3 37.4477 3 37.4228 3.0015C7.87989 4.3719 9.00565 24 9.00565 24C9.00564 26.329 9.54934 28.6259 10.5935 30.7078C11.6376 32.7896 13.1533 34.599 15.0199 35.9919L9.35529 42.5332C9.17379 42.7527 9.05821 43.0191 9.02193 43.3016C8.98566 43.584 9.03019 43.871 9.15036 44.1292C9.27053 44.3874 9.46142 44.6062 9.70089 44.7603C9.94037 44.9145 10.2186 44.9976 10.5034 45C10.528 45 10.5524 45 10.5773 44.9985C40.1203 43.6281 38.9945 24 38.9945 24C38.9945 21.671 38.4509 19.3742 37.4068 17.2923C36.3628 15.2105 34.8472 13.4011 32.9807 12.0081L38.6449 5.46675C38.8264 5.2473 38.942 4.9809 38.9783 4.69843C39.0145 4.41596 38.97 4.129 38.8498 3.87081C38.7297 3.61262 38.5388 3.39378 38.2993 3.23965C38.0598 3.08553 37.7816 3.00243 37.4968 3Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_1939_11803">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const earthquake = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6232)">
            <path d="M24.9184 3.32086C24.6523 3.11294 24.3242 3 23.9864 3C23.6487 3 23.3206 3.11294 23.0544 3.32086L1.5 20.1291L3.36405 22.4868L6 20.4317V39C6.00163 39.7952 6.31822 40.5573 6.88047 41.1195C7.44273 41.6818 8.20485 41.9984 9 42H39C39.7952 41.9985 40.5574 41.682 41.1197 41.1197C41.682 40.5574 41.9985 39.7952 42 39V20.445L44.6359 22.5L46.5 20.1423L24.9184 3.32086ZM9 18.0923L22.5 7.57501V18.6207L27.687 23.8077L17.5854 31.0235L21.5727 39H9V18.0923ZM39 39H24.9273L21.4146 31.9761L32.313 24.1919L25.5 17.3789V7.57771L39 18.1077V39Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6232">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const coldwave = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6239)">
            <path d="M40.7505 25.335L32.58 19.5L40.7505 13.6635L44.526 14.922L45.474 12.0765L42 10.9185V7.5H39V11.2275L31.5 16.5855V8.0505L35.3325 5.496L33.6675 3L30 5.445L26.3325 3L24.6675 5.496L28.5 8.0505V16.5855L24 13.371V17.058L27.42 19.5L24 21.942V25.629L28.5 22.4145V32.5545L33.6675 36L35.3325 33.504L31.5 30.9495V22.4145L39 27.7725V31.5H42V28.0815L45.474 26.922L44.526 24.0765L40.7505 25.335Z" fill="#2D3E4C"/>
            <path d="M18 34.5C18 35.6935 17.5259 36.8381 16.682 37.682C15.8381 38.5259 14.6935 39 13.5 39C12.3065 39 11.1619 38.5259 10.318 37.682C9.47411 36.8381 9 35.6935 9 34.5H18Z" fill="#2D3E4C"/>
            <path d="M13.4999 45C11.4332 45.002 9.41185 44.3935 7.68975 43.2507C5.96764 42.108 4.62149 40.4819 3.82028 38.5768C3.01908 36.6717 2.79852 34.5723 3.1863 32.5422C3.57407 30.5122 4.55291 28.6419 5.99992 27.1662V10.5C5.99992 8.51088 6.7901 6.60322 8.19662 5.1967C9.60314 3.79018 11.5108 3 13.4999 3C15.489 3 17.3967 3.79018 18.8032 5.1967C20.2097 6.60322 20.9999 8.51088 20.9999 10.5V27.1662C22.4469 28.6419 23.4258 30.5122 23.8135 32.5422C24.2013 34.5723 23.9808 36.6717 23.1796 38.5768C22.3783 40.4819 21.0322 42.108 19.3101 43.2507C17.588 44.3935 15.5667 45.002 13.4999 45ZM13.4999 6C12.3068 6.00131 11.163 6.47584 10.3194 7.31947C9.47576 8.1631 9.00123 9.30693 8.99992 10.5V28.4751L8.50192 28.9226C7.36924 29.9349 6.57069 31.2674 6.21199 32.7436C5.85328 34.2198 5.95133 35.7702 6.49315 37.1894C7.03497 38.6087 7.99501 39.8299 9.24621 40.6916C10.4974 41.5532 11.9808 42.0145 13.4999 42.0145C15.0191 42.0145 16.5024 41.5532 17.7536 40.6916C19.0048 39.8299 19.9649 38.6087 20.5067 37.1894C21.0485 35.7702 21.1466 34.2198 20.7878 32.7436C20.4291 31.2674 19.6306 29.9349 18.4979 28.9226L17.9999 28.4751V10.5C17.9986 9.30693 17.5241 8.1631 16.6805 7.31947C15.8368 6.47584 14.693 6.00131 13.4999 6Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6239">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const heatwave = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6268)">
            <path d="M39 19.5H45V22.5H39V19.5Z" fill="#2D3E4C"/>
            <path d="M34.5 11.3787L38.7425 7.13613L40.8636 9.25724L36.6211 13.4998L34.5 11.3787Z" fill="#2D3E4C"/>
            <path d="M34.5 30.6211L36.6211 28.5L40.8636 32.7425L38.7425 34.8636L34.5 30.6211Z" fill="#2D3E4C"/>
            <path d="M25.5 3H28.5V9H25.5V3Z" fill="#2D3E4C"/>
            <path d="M27 12C26.4971 12.0033 25.9954 12.0484 25.5 12.135V15.2127C25.9889 15.078 26.493 15.0065 27 15C28.5913 15 30.1174 15.6321 31.2426 16.7574C32.3679 17.8826 33 19.4087 33 21C33 22.5913 32.3679 24.1174 31.2426 25.2426C30.1174 26.3679 28.5913 27 27 27V30C29.3869 30 31.6761 29.0518 33.364 27.364C35.0518 25.6761 36 23.3869 36 21C36 18.6131 35.0518 16.3239 33.364 14.636C31.6761 12.9482 29.3869 12 27 12Z" fill="#2D3E4C"/>
            <path d="M15 30.2759V10.5H12V30.2759C10.9992 30.6297 10.1557 31.326 9.61856 32.2416C9.08145 33.1572 8.88531 34.2332 9.06482 35.2794C9.24432 36.3257 9.78792 37.2748 10.5995 37.959C11.4111 38.6432 12.4385 39.0185 13.5 39.0185C14.5615 39.0185 15.5889 38.6432 16.4005 37.959C17.2121 37.2748 17.7557 36.3257 17.9352 35.2794C18.1147 34.2332 17.9186 33.1572 17.3815 32.2416C16.8443 31.326 16.0008 30.6297 15 30.2759Z" fill="#2D3E4C"/>
            <path d="M13.4999 45C11.4332 45.002 9.41185 44.3935 7.68975 43.2507C5.96764 42.108 4.62149 40.482 3.82028 38.5768C3.01908 36.6717 2.79852 34.5723 3.1863 32.5422C3.57407 30.5122 4.55291 28.6419 5.99992 27.1662V10.5C5.99992 8.51088 6.7901 6.60322 8.19662 5.1967C9.60314 3.79018 11.5108 3 13.4999 3C15.489 3 17.3967 3.79018 18.8032 5.1967C20.2097 6.60322 20.9999 8.51088 20.9999 10.5V27.1662C22.4469 28.6419 23.4258 30.5122 23.8135 32.5422C24.2013 34.5723 23.9808 36.6717 23.1796 38.5768C22.3783 40.482 21.0322 42.108 19.3101 43.2507C17.588 44.3935 15.5667 45.002 13.4999 45ZM13.4999 6C12.3068 6.00131 11.163 6.47584 10.3194 7.31947C9.47576 8.1631 9.00123 9.30693 8.99992 10.5V28.4751L8.50192 28.9226C7.36924 29.9349 6.57069 31.2674 6.21199 32.7436C5.85328 34.2198 5.95133 35.7702 6.49315 37.1894C7.03497 38.6087 7.99501 39.8299 9.24621 40.6916C10.4974 41.5532 11.9808 42.0145 13.4999 42.0145C15.0191 42.0145 16.5024 41.5532 17.7536 40.6916C19.0048 39.8299 19.9649 38.6087 20.5067 37.1894C21.0485 35.7702 21.1466 34.2198 20.7878 32.7436C20.4291 31.2674 19.6306 29.9349 18.4979 28.9226L17.9999 28.4751V10.5C17.9986 9.30693 17.5241 8.1631 16.6805 7.31947C15.8368 6.47584 14.693 6.00131 13.4999 6Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6268">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)
const hail = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6279)">
            <path d="M29.999 44.25C29.999 44.8467 30.2361 45.419 30.658 45.841C31.08 46.2629 31.6523 46.5 32.249 46.5C32.8458 46.5 33.4181 46.2629 33.84 45.841C34.262 45.419 34.499 44.8467 34.499 44.25C34.499 43.6533 34.262 43.081 33.84 42.659C33.4181 42.2371 32.8458 42 32.249 42C31.6523 42 31.08 42.2371 30.658 42.659C30.2361 43.081 29.999 43.6533 29.999 44.25Z" fill="#2D3E4C"/>
            <path d="M34.499 38.25C34.499 38.8467 34.7361 39.419 35.158 39.841C35.58 40.2629 36.1523 40.5 36.749 40.5C37.3458 40.5 37.9181 40.2629 38.34 39.841C38.762 39.419 38.999 38.8467 38.999 38.25C38.999 37.6533 38.762 37.081 38.34 36.659C37.9181 36.2371 37.3458 36 36.749 36C36.1523 36 35.58 36.2371 35.158 36.659C34.7361 37.081 34.499 37.6533 34.499 38.25Z" fill="#2D3E4C"/>
            <path d="M9 38.25C9 38.8467 9.23705 39.419 9.65901 39.841C10.081 40.2629 10.6533 40.5 11.25 40.5C11.8467 40.5 12.419 40.2629 12.841 39.841C13.2629 39.419 13.5 38.8467 13.5 38.25C13.5 37.6533 13.2629 37.081 12.841 36.659C12.419 36.2371 11.8467 36 11.25 36C10.6533 36 10.081 36.2371 9.65901 36.659C9.23705 37.081 9 37.6533 9 38.25Z" fill="#2D3E4C"/>
            <path d="M4.49902 44.25C4.49902 44.5455 4.55722 44.8381 4.67029 45.111C4.78337 45.384 4.9491 45.6321 5.15803 45.841C5.36697 46.0499 5.615 46.2157 5.88799 46.3287C6.16097 46.4418 6.45355 46.5 6.74902 46.5C7.0445 46.5 7.33708 46.4418 7.61006 46.3287C7.88304 46.2157 8.13108 46.0499 8.34001 45.841C8.54895 45.6321 8.71468 45.384 8.82775 45.111C8.94083 44.8381 8.99902 44.5455 8.99902 44.25C8.99902 43.9545 8.94083 43.6619 8.82775 43.389C8.71468 43.116 8.54895 42.8679 8.34001 42.659C8.13108 42.4501 7.88304 42.2843 7.61006 42.1713C7.33708 42.0582 7.0445 42 6.74902 42C6.45355 42 6.16097 42.0582 5.88799 42.1713C5.615 42.2843 5.36697 42.4501 5.15803 42.659C4.9491 42.8679 4.78337 43.116 4.67029 43.389C4.55722 43.6619 4.49902 43.9545 4.49902 44.25Z" fill="#2D3E4C"/>
            <path d="M13.499 44.25C13.499 44.8467 13.7361 45.419 14.158 45.841C14.58 46.2629 15.1523 46.5 15.749 46.5C16.3458 46.5 16.9181 46.2629 17.34 45.841C17.762 45.419 17.999 44.8467 17.999 44.25C17.999 43.6533 17.762 43.081 17.34 42.659C16.9181 42.2371 16.3458 42 15.749 42C15.1523 42 14.58 42.2371 14.158 42.659C13.7361 43.081 13.499 43.6533 13.499 44.25Z" fill="#2D3E4C"/>
            <path d="M23.8015 45.7441L21.1975 44.2561L25.9135 36.0001H16.915L24.1975 23.2561L26.8015 24.7441L22.084 33.0001H31.0855L23.8015 45.7441Z" fill="#2D3E4C"/>
            <path d="M35.2503 32.9999H34.5003V29.9999H35.2503C36.9936 30.0006 38.6696 29.3264 39.9268 28.1186C41.184 26.9108 41.9248 25.2632 41.9939 23.5212C42.0631 21.7792 41.4551 20.078 40.2976 18.7744C39.1401 17.4708 37.5228 16.6659 35.7849 16.5284L34.5618 16.4326L34.4139 15.2146C34.1024 12.6722 32.8716 10.3316 30.9534 8.63411C29.0353 6.93662 26.5624 5.99953 24.001 5.99953C21.4396 5.99953 18.9667 6.93662 17.0486 8.63411C15.1305 10.3316 13.8996 12.6722 13.5882 15.2146L13.4395 16.4326L12.2163 16.5284C10.4784 16.6659 8.86115 17.4707 7.70362 18.7743C6.5461 20.0779 5.93813 21.7789 6.00718 23.5209C6.07623 25.2628 6.81693 26.9104 8.07401 28.1183C9.33109 29.3261 11.0069 30.0005 12.7503 29.9999H13.5003V32.9999H12.7503C10.3344 33.001 8.00423 32.1047 6.21177 30.485C4.41931 28.8653 3.29232 26.6375 3.04941 24.2339C2.8065 21.8303 3.46499 19.4221 4.89714 17.4765C6.32929 15.5309 8.43302 14.1865 10.8003 13.7042C11.4394 10.6768 13.0998 7.96105 15.5031 6.01218C17.9064 4.06332 20.9065 2.99976 24.0007 2.99976C27.0949 2.99976 30.095 4.06332 32.4983 6.01218C34.9016 7.96105 36.562 10.6768 37.2012 13.7042C39.5682 14.1869 41.6716 15.5314 43.1035 17.477C44.5354 19.4226 45.1936 21.8307 44.9506 24.2342C44.7076 26.6377 43.5807 28.8653 41.7883 30.4849C39.996 32.1045 37.666 33.0008 35.2503 32.9999Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6279">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const snowstorm = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6325)">
            <path d="M37.5 42C35.5116 41.9977 33.6052 41.2068 32.1992 39.8008C30.7932 38.3948 30.0023 36.4884 30 34.5H33C33 35.39 33.2639 36.26 33.7584 37.0001C34.2529 37.7401 34.9557 38.3169 35.7779 38.6575C36.6002 38.9981 37.505 39.0872 38.3779 38.9135C39.2508 38.7399 40.0526 38.3113 40.682 37.682C41.3113 37.0526 41.7399 36.2508 41.9135 35.3779C42.0872 34.505 41.9981 33.6002 41.6575 32.7779C41.3169 31.9557 40.7401 31.2529 40.0001 30.7584C39.26 30.2639 38.39 30 37.5 30H9V27H37.5C39.4891 27 41.3968 27.7902 42.8033 29.1967C44.2098 30.6032 45 32.5109 45 34.5C45 36.4891 44.2098 38.3968 42.8033 39.8033C41.3968 41.2098 39.4891 42 37.5 42Z" fill="#2D3E4C"/>
            <path d="M34.5 22.5H15V19.5H34.5C35.39 19.5 36.26 19.2361 37.0001 18.7416C37.7401 18.2472 38.3169 17.5443 38.6575 16.7221C38.9981 15.8998 39.0872 14.995 38.9135 14.1221C38.7399 13.2492 38.3113 12.4474 37.682 11.818C37.0526 11.1887 36.2508 10.7601 35.3779 10.5865C34.505 10.4128 33.6002 10.502 32.7779 10.8425C31.9557 11.1831 31.2529 11.7599 30.7584 12.4999C30.2639 13.24 30 14.11 30 15H27C27 13.5166 27.4399 12.0666 28.264 10.8332C29.0881 9.59986 30.2594 8.63856 31.6299 8.07091C33.0003 7.50325 34.5083 7.35472 35.9632 7.64411C37.418 7.9335 38.7544 8.64781 39.8033 9.6967C40.8522 10.7456 41.5665 12.082 41.8559 13.5368C42.1453 14.9917 41.9968 16.4997 41.4291 17.8701C40.8614 19.2406 39.9001 20.4119 38.6668 21.236C37.4334 22.0601 35.9834 22.5 34.5 22.5Z" fill="#2D3E4C"/>
            <path d="M16.5 34.5H19.5V37.5H16.5V34.5Z" fill="#2D3E4C"/>
            <path d="M19.5 37.5H22.5V40.5H19.5V37.5Z" fill="#2D3E4C"/>
            <path d="M22.5 40.5H25.5V43.5H22.5V40.5Z" fill="#2D3E4C"/>
            <path d="M22.5 34.5H25.5V37.5H22.5V34.5Z" fill="#2D3E4C"/>
            <path d="M16.5 40.5H19.5V43.5H16.5V40.5Z" fill="#2D3E4C"/>
            <path d="M9 6H12V9H9V6Z" fill="#2D3E4C"/>
            <path d="M12 9H15V12H12V9Z" fill="#2D3E4C"/>
            <path d="M15 12H18V15H15V12Z" fill="#2D3E4C"/>
            <path d="M15 6H18V9H15V6Z" fill="#2D3E4C"/>
            <path d="M9 12H12V15H9V12Z" fill="#2D3E4C"/>
            <path d="M3 39H6V42H3V39Z" fill="#2D3E4C"/>
            <path d="M6 42H9V45H6V42Z" fill="#2D3E4C"/>
            <path d="M9 45H12V48H9V45Z" fill="#2D3E4C"/>
            <path d="M9 39H12V42H9V39Z" fill="#2D3E4C"/>
            <path d="M3 45H6V48H3V45Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6325">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const ice = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6334)">
            <path d="M6 3C5.20435 3 4.44129 3.31607 3.87868 3.87868C3.31607 4.44129 3 5.20435 3 6V30L4.5 33L6 30V6H12V21L13.5 24L15 21V3H6Z" fill="#2D3E4C"/>
            <path d="M42 3H21V15L22.5 18L24 15V6H27V25.5L28.5 28.5L30 25.5V6H36V21L37.5 24L39 21V6H42V36L43.5 39L45 36V6C45 5.20435 44.6839 4.44129 44.1213 3.87868C43.5587 3.31607 42.7956 3 42 3Z" fill="#2D3E4C"/>
            <path d="M21 42L19.5 45L18 42V24H21V42Z" fill="#2D3E4C"/>
            <path d="M36 39L34.5 42L33 39V30H36V39Z" fill="#2D3E4C"/>
            <path d="M12 36L10.5 39L9 36V27H12V36Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6334">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)
const lightning = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6347)">
            <path d="M35.2498 33.0001H34.4998V30.0001H35.2498C37.04 30.0717 38.7853 29.4292 40.1018 28.214C41.4183 26.9987 42.1982 25.3103 42.2698 23.5201C42.3414 21.7299 41.6989 19.9845 40.4837 18.668C39.2684 17.3515 37.58 16.5717 35.7898 16.5001H34.4998L34.3498 15.2701C34.017 12.7448 32.7776 10.4265 30.8624 8.74716C28.9473 7.06782 26.4869 6.14191 23.9398 6.14191C21.3926 6.14191 18.9323 7.06782 17.0171 8.74716C15.102 10.4265 13.8626 12.7448 13.5298 15.2701L13.4998 16.5001H12.2098C10.4196 16.5717 8.73113 17.3515 7.5159 18.668C6.30066 19.9845 5.65818 21.7299 5.72979 23.5201C5.8014 25.3103 6.58123 26.9987 7.89774 28.214C9.21424 29.4292 10.9596 30.0717 12.7498 30.0001H13.4998V33.0001H12.7498C10.3444 32.9849 8.02954 32.081 6.25027 30.4622C4.471 28.8435 3.35291 26.6241 3.11098 24.2309C2.86905 21.8377 3.52035 19.4395 4.93967 17.4974C6.35898 15.5553 8.44611 14.2064 10.7998 13.7101C11.4473 10.6899 13.111 7.98305 15.5133 6.04129C17.9155 4.09954 20.9109 3.04028 23.9998 3.04028C27.0887 3.04028 30.0841 4.09954 32.4863 6.04129C34.8885 7.98305 36.5522 10.6899 37.1998 13.7101C39.5535 14.2064 41.6406 15.5553 43.0599 17.4974C44.4792 19.4395 45.1305 21.8377 44.8886 24.2309C44.6467 26.6241 43.5286 28.8435 41.7493 30.4622C39.97 32.081 37.6552 32.9849 35.2498 33.0001Z" fill="#2D3E4C"/>
            <path d="M23.8049 45.75L21.1949 44.25L25.9199 36H16.9199L24.1949 23.25L26.8049 24.75L22.0799 33H31.0799L23.8049 45.75Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6347">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const tornado = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6357)">
            <path d="M24 39H30V42H24V39Z" fill="#2D3E4C"/>
            <path d="M18 33H27V36H18V33Z" fill="#2D3E4C"/>
            <path d="M12 27H27V30H12V27Z" fill="#2D3E4C"/>
            <path d="M12 21H30V24H12V21Z" fill="#2D3E4C"/>
            <path d="M15 15H36V18H15V15Z" fill="#2D3E4C"/>
            <path d="M12 9H39V12H12V9Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6357">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const fire = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6362)">
            <path d="M37.248 25.4532C36.8394 24.4834 36.3757 23.3832 35.923 22.0254C34.7381 18.4731 38.5247 14.5971 38.5605 14.5605L36.4395 12.4395C36.2284 12.6504 31.3044 17.6558 33.077 22.9746C33.5661 24.4416 34.0539 25.5981 34.484 26.6196C35.4848 28.5973 36.0042 30.7835 36 33C35.8243 34.7866 35.1385 36.4851 34.0243 37.8928C32.9102 39.3005 31.4147 40.3581 29.7162 40.9395C30.2527 38.8359 30.2445 36.6304 29.6924 34.5308C29.1403 32.4313 28.0624 30.507 26.5605 28.9395L24.9939 27.3727L24.1217 29.409C21.3674 35.835 18.09 38.64 16.1621 39.81C14.9788 39.0853 13.9846 38.0901 13.261 36.9062C12.5374 35.7223 12.1053 34.3835 12 33C12.1033 31.1118 12.5767 29.2623 13.3931 27.5567C14.3616 25.5005 14.9081 23.271 15 21V18.3326C16.3103 18.8726 18 20.2881 18 24V27.9053L20.6148 25.0041C25.2825 19.8222 24.3084 13.6524 22.4238 9.54195C23.8569 10.0197 25.0876 10.9658 25.9177 12.228C26.7478 13.4901 27.129 14.9949 27 16.5H30C30 8.19435 23.1321 6 19.5 6H16.5L18.2988 8.3979C18.5053 8.6763 22.593 14.2896 20.3291 19.9299C19.8253 18.5123 18.9023 17.2816 17.6826 16.401C16.4628 15.5205 15.004 15.0318 13.5 15H12V21C11.8967 22.8882 11.4233 24.7377 10.6069 26.4433C9.63836 28.4995 9.09194 30.729 9 33C9 38.7715 14.7348 45 24 45C33.2652 45 39 38.7715 39 33C39.0023 30.3834 38.4028 27.8012 37.248 25.4532ZM19.2528 41.2896C22.0197 38.9988 24.2547 36.1331 25.8025 32.8915C26.6294 34.2263 27.0991 35.7512 27.1667 37.3199C27.2343 38.8885 26.8974 40.4482 26.1885 41.8491C25.463 41.9465 24.732 41.9969 24 42C22.3903 42.0113 20.7887 41.7716 19.2528 41.2896Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6362">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const wind = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <g clipPath="url(#clip0_2222_6373)">
            <path d="M19.5 45C17.5116 44.9977 15.6052 44.2068 14.1992 42.8008C12.7932 41.3948 12.0023 39.4884 12 37.5H15C15 38.39 15.2639 39.26 15.7584 40.0001C16.2529 40.7401 16.9557 41.3169 17.7779 41.6575C18.6002 41.9981 19.505 42.0872 20.3779 41.9135C21.2508 41.7399 22.0526 41.3113 22.682 40.682C23.3113 40.0526 23.7399 39.2508 23.9135 38.3779C24.0872 37.505 23.9981 36.6002 23.6575 35.7779C23.3169 34.9557 22.7401 34.2529 22.0001 33.7584C21.26 33.2639 20.39 33 19.5 33H6V30H19.5C21.4891 30 23.3968 30.7902 24.8033 32.1967C26.2098 33.6032 27 35.5109 27 37.5C27 39.4891 26.2098 41.3968 24.8033 42.8033C23.3968 44.2098 21.4891 45 19.5 45Z" fill="#2D3E4C"/>
            <path d="M37.5 37.5C35.5116 37.4977 33.6052 36.7068 32.1992 35.3008C30.7932 33.8948 30.0023 31.9884 30 30H33C33 30.89 33.2639 31.76 33.7584 32.5001C34.2529 33.2401 34.9557 33.8169 35.7779 34.1575C36.6002 34.4981 37.505 34.5872 38.3779 34.4135C39.2508 34.2399 40.0526 33.8113 40.682 33.182C41.3113 32.5526 41.7399 31.7508 41.9135 30.8779C42.0872 30.005 41.9981 29.1002 41.6575 28.2779C41.3169 27.4557 40.7401 26.7529 40.0001 26.2584C39.26 25.7639 38.39 25.5 37.5 25.5H3V22.5H37.5C39.4891 22.5 41.3968 23.2902 42.8033 24.6967C44.2098 26.1032 45 28.0109 45 30C45 31.9891 44.2098 33.8968 42.8033 35.3033C41.3968 36.7098 39.4891 37.5 37.5 37.5Z" fill="#2D3E4C"/>
            <path d="M31.5 18H9V15H31.5C32.39 15 33.26 14.7361 34.0001 14.2416C34.7401 13.7471 35.3169 13.0443 35.6575 12.2221C35.9981 11.3998 36.0872 10.495 35.9135 9.6221C35.7399 8.74918 35.3113 7.94736 34.682 7.31802C34.0526 6.68869 33.2508 6.2601 32.3779 6.08647C31.505 5.91284 30.6002 6.00195 29.7779 6.34255C28.9557 6.68314 28.2529 7.25992 27.7584 7.99994C27.2639 8.73996 27 9.60999 27 10.5H24C24 9.01664 24.4399 7.5666 25.264 6.33323C26.0881 5.09986 27.2594 4.13856 28.6299 3.57091C30.0003 3.00325 31.5083 2.85472 32.9632 3.14411C34.418 3.4335 35.7544 4.14781 36.8033 5.1967C37.8522 6.2456 38.5665 7.58197 38.8559 9.03683C39.1453 10.4917 38.9968 11.9997 38.4291 13.3701C37.8614 14.7406 36.9001 15.9119 35.6668 16.736C34.4334 17.5601 32.9834 18 31.5 18Z" fill="#2D3E4C"/>
        </g>
        <defs>
            <clipPath id="clip0_2222_6373">
                <rect width="48" height="48" fill="white"/>
            </clipPath>
        </defs>
    </svg>
)

const landslide = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M5.0431 5.23429C5.46599 4.70582 6.23722 4.62022 6.76569 5.0431L10.9639 8.40249C11.6693 8.96676 12.239 9.68257 12.6305 10.4966C13.0219 11.3108 13.2253 12.2026 13.2255 13.106V17.211C13.2258 18.1586 13.6025 19.0677 14.2728 19.7377L26.3856 31.8505L26.3866 31.8515C27.1126 32.5762 27.641 33.475 27.9211 34.4622L27.9215 34.4636L29.1047 38.6045C29.2589 39.1439 29.2858 39.712 29.1829 40.264C29.0801 40.8157 28.8504 41.3365 28.5125 41.7844C28.1743 42.2322 27.7369 42.5955 27.2345 42.8456C26.7321 43.0957 26.1781 43.2257 25.6171 43.2255L5.99999 43.2255C5.32315 43.2255 4.77446 42.6768 4.77446 42C4.77446 41.3231 5.32315 40.7745 5.99999 40.7745H25.6181C25.8 40.7745 25.9794 40.7324 26.1421 40.6514C26.305 40.5703 26.4468 40.4526 26.5563 40.3075C26.6658 40.1623 26.7401 39.9934 26.7733 39.8149C26.8066 39.6365 26.7979 39.4526 26.748 39.278L25.564 35.1345L25.5633 35.1319C25.3976 34.5473 25.0846 34.0149 24.6544 33.5856L12.5398 21.471C11.4098 20.3414 10.7748 18.809 10.7745 17.2113V13.1062L10.4215 11.5588L9.43269 10.3164L5.23429 6.95688C4.70582 6.53399 4.62022 5.76277 5.0431 5.23429Z" fill="#2D3E4C"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M26.374 22.7999C26.374 19.4722 29.0717 16.7744 32.3996 16.7744C35.7275 16.7744 38.4251 19.4722 38.4251 22.7999C38.4251 26.1278 35.7274 28.8255 32.3996 28.8255C29.0717 28.8255 26.374 26.1278 26.374 22.7999ZM32.3996 19.2255C30.4254 19.2255 28.8251 20.8258 28.8251 22.7999C28.8251 24.7741 30.4254 26.3744 32.3996 26.3744C34.3738 26.3744 35.974 24.7741 35.974 22.7999C35.974 20.8258 34.3737 19.2255 32.3996 19.2255Z" fill="#2D3E4C"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M33.5742 38.3885C33.5742 35.7235 35.7347 33.563 38.3998 33.563C41.0648 33.563 43.2253 35.7235 43.2253 38.3885C43.2253 41.0537 41.0647 43.2141 38.3998 43.2141C35.7348 43.2141 33.5742 41.0537 33.5742 38.3885ZM38.3998 36.0141C37.0884 36.0141 36.0253 37.0772 36.0253 38.3885C36.0253 39.7 37.0884 40.763 38.3998 40.763C39.7111 40.763 40.7742 39.7 40.7742 38.3885C40.7742 37.0772 39.7111 36.0141 38.3998 36.0141Z" fill="#2D3E4C"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M22.8001 12.6256C23.1456 12.6256 23.4257 12.3456 23.4257 12.0001C23.4257 11.6546 23.1456 11.3746 22.8001 11.3746V10.1746C21.792 10.1746 20.9746 10.9919 20.9746 12.0001C20.9746 13.0083 21.792 13.8256 22.8001 13.8256V12.6256Z" fill="#2D3E4C"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M22.8003 10.1746C23.8085 10.1746 24.6259 10.9919 24.6259 12.0001C24.6259 13.0083 23.8085 13.8256 22.8003 13.8256V12.6256C22.4549 12.6256 22.1748 12.3456 22.1748 12.0001C22.1748 11.6546 22.4549 11.3746 22.8003 11.3746V10.1746Z" fill="#2D3E4C"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M21.5999 22.2255C21.9454 22.2255 22.2255 21.9454 22.2255 21.5999C22.2255 21.2545 21.9454 20.9744 21.5999 20.9744V19.7744C20.5917 19.7744 19.7744 20.5917 19.7744 21.5999C19.7744 22.6081 20.5917 23.4255 21.5999 23.4255V22.2255Z" fill="#2D3E4C"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M21.6001 19.7744C22.6083 19.7744 23.4257 20.5917 23.4257 21.5999C23.4257 22.6081 22.6083 23.4255 21.6001 23.4255V22.2255C21.2547 22.2255 20.9746 21.9454 20.9746 21.5999C20.9746 21.2545 21.2547 20.9744 21.6001 20.9744V19.7744Z" fill="#2D3E4C"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M40.8001 29.4254C41.1456 29.4254 41.4257 29.1454 41.4257 28.7999C41.4257 28.4544 41.1456 28.1744 40.8001 28.1744V26.9744C39.7919 26.9744 38.9746 27.7917 38.9746 28.7999C38.9746 29.8081 39.7919 30.6254 40.8001 30.6254V29.4254Z" fill="#2D3E4C"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M40.8003 26.9744C41.8085 26.9744 42.6259 27.7917 42.6259 28.7999C42.6259 29.8081 41.8085 30.6254 40.8003 30.6254V29.4254C40.4549 29.4254 40.1748 29.1454 40.1748 28.7999C40.1748 28.4544 40.4549 28.1744 40.8003 28.1744V26.9744Z" fill="#2D3E4C"/>
    </svg>
)

const volcano = (props) => (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path fillRule="evenodd" clipRule="evenodd" d="M8.19485 1.44414C7.1474 1.69091 6.70345 2.89902 7.32793 3.8033C7.49055 4.03878 7.88362 4.29362 8.18362 4.35808C8.31562 4.38645 8.66122 4.42221 8.95162 4.43757C10.7295 4.53174 12.3129 5.29466 13.7789 6.76355C15.0388 8.0259 16.15 9.77363 16.8762 11.6349C17.0998 12.208 17.3473 12.5102 17.7488 12.7C18.5177 13.0638 19.4716 12.6772 19.7725 11.8798C19.9893 11.3052 19.8499 10.7481 19.1109 9.2368C16.7993 4.50914 13.3808 1.78307 9.33562 1.44155C8.66602 1.38501 8.44373 1.38554 8.19485 1.44414ZM38.5676 1.44352C35.2585 1.74971 32.3759 3.67038 30.1086 7.07992C29.4895 8.01093 28.7535 9.41469 28.3597 10.4159C28.0015 11.3264 28.0661 11.9054 28.5819 12.4078C29.3799 13.1849 30.6637 12.8688 31.0574 11.7982C31.2694 11.2216 31.7273 10.2532 32.0833 9.62814C33.9444 6.36078 36.3318 4.58142 39.0476 4.43757C39.338 4.42221 39.6836 4.38611 39.8156 4.35741C40.935 4.11386 41.347 2.67011 40.5302 1.85334C40.125 1.44813 39.6316 1.34507 38.5676 1.44352ZM23.4236 2.1772C22.6572 2.38586 22.0039 3.06986 21.8449 3.83027C21.6789 4.62357 21.9073 5.35398 22.4929 5.90166C22.8552 6.24064 23.1906 6.41046 23.6516 6.48856C24.3351 6.60424 24.9701 6.40336 25.5064 5.90166C26.0919 5.35398 26.3204 4.62357 26.1544 3.83027C25.9922 3.05488 25.2928 2.3405 24.5221 2.1628C24.2395 2.09766 23.6893 2.10486 23.4236 2.1772ZM3.74866 7.8039C2.83906 8.04846 2.18146 8.83946 2.1242 9.75779C2.08033 10.4606 2.27487 11.0057 2.73562 11.4715C3.30298 12.045 4.10161 12.2704 4.86298 12.0722C5.26633 11.9671 5.50561 11.8294 5.83618 11.5119C6.52561 10.8499 6.71501 9.82816 6.30485 8.9837C6.14516 8.65485 5.68873 8.16698 5.38733 8.00296C4.90105 7.73824 4.27532 7.66226 3.74866 7.8039ZM43.1087 7.8039C42.7132 7.91022 42.4049 8.10093 42.0979 8.42915C41.7589 8.7915 41.5891 9.12688 41.511 9.58792C41.3246 10.689 42.0401 11.7867 43.1293 12.0703C43.8979 12.2705 44.6941 12.0472 45.2636 11.4715C45.7244 11.0057 45.9189 10.4606 45.875 9.75779C45.7908 8.40746 44.4323 7.44794 43.1087 7.8039ZM18.7436 15.5028C17.638 15.6711 16.5989 16.2952 15.8981 17.2118C15.671 17.5089 15.38 18.0804 15.2645 18.4559C15.2077 18.6407 15.0224 19.6883 14.8526 20.7839C14.4682 23.2651 14.3352 24.0427 14.1546 24.8639C13.0088 30.0762 10.7031 34.7335 7.23049 38.85C6.74233 39.4287 5.14047 41.0677 4.02917 42.1257C3.68281 42.4555 3.52671 42.6459 3.39063 42.9049C2.96453 43.7158 2.98949 44.6042 3.46047 45.3868C3.80775 45.9639 4.53303 46.4571 5.18362 46.5585C5.62565 46.6275 42.3884 46.6258 42.8156 46.5568C43.6486 46.4224 44.4355 45.7774 44.738 44.9813C45.0157 44.2505 44.9202 43.3506 44.4977 42.7149C44.4206 42.5989 43.834 41.9972 43.1941 41.3779C41.6317 39.8657 40.789 38.944 39.802 37.668C36.9107 33.9298 34.8337 29.4749 33.8437 24.8879C33.639 23.9401 33.5466 23.4018 33.1663 20.945C32.8359 18.8102 32.7265 18.3095 32.4885 17.8412C31.9556 16.7933 30.9767 15.9877 29.7836 15.6154L29.3516 15.4806L24.1676 15.4734C21.3164 15.4695 18.8756 15.4827 18.7436 15.5028ZM18.9541 18.5462C18.6097 18.6692 18.3437 18.9162 18.1977 19.2485C18.1361 19.3886 18 20.1354 17.8083 21.3839C17.2381 25.1005 16.928 26.5573 16.2555 28.6799C14.6086 33.8786 11.7364 38.6478 7.88593 42.5777L6.9001 43.5839H23.9998H41.0995L40.0736 42.5385C35.5214 37.8998 32.3591 32.0734 30.9378 25.7063C30.7238 24.7479 30.5086 23.5063 30.1675 21.2639C30.021 20.3003 29.8657 19.4156 29.8225 19.2978C29.7157 19.0068 29.3604 18.6604 29.0654 18.5599C28.8698 18.4933 28.6213 18.4799 27.5789 18.4799H26.3272L24.9715 21.1919L23.6157 23.9039H25.3419C26.9599 23.9039 27.0843 23.91 27.3289 24.0015C27.8653 24.2022 28.254 24.7127 28.3058 25.2844C28.3296 25.5467 28.2301 25.9209 26.8794 30.6511C26.0809 33.4478 25.3778 35.8345 25.3173 35.9549C25.1834 36.2211 24.8806 36.5033 24.5815 36.6406C24.4159 36.7167 24.2683 36.742 23.9996 36.7404C23.381 36.7366 22.8976 36.419 22.6274 35.8386C22.3993 35.3487 22.3892 35.3965 23.6568 30.9599L24.8019 26.9519L22.8276 26.9279L20.8533 26.9039L20.5321 26.7458C19.9759 26.4717 19.7117 26.0429 19.7067 25.4058L19.7036 25.0117L21.3236 21.769C22.2146 19.9856 22.9436 18.5159 22.9436 18.5032C22.9436 18.4904 22.085 18.4809 21.0356 18.482C19.6023 18.4836 19.0845 18.4996 18.9541 18.5462Z" fill="#2D3E4C"/>
    </svg>

)


const Fill = ({className='fill-slate-800'}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" className={className}><path fillRule="evenodd" clipRule="evenodd" d="M18.6289 16.4087C18.7672 16.1958 18.7885 15.9274 18.6854 15.6954L14.6854 6.6954C14.5242 6.3327 14.1083 6.15839 13.7367 6.29775L5.73666 9.29775C5.44393 9.40753 5.25 9.68737 5.25 10L5.25 16C5.25 16.4142 5.58578 16.75 6 16.75L18 16.75C18.2539 16.75 18.4905 16.6216 18.6289 16.4087ZM16.8459 15.25L6.75 15.25L6.75 10.5197L13.6017 7.95038L16.8459 15.25Z" ></path></svg>
)

const Circle = ({className='fill-slate-800'}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" className={className}>
        <path fillRule="evenodd" clipRule="evenodd" d="M12 14.5C13.3807 14.5 14.5 13.3807 14.5 12C14.5 10.6193 13.3807 9.5 12 9.5C10.6193 9.5 9.5 10.6193 9.5 12C9.5 13.3807 10.6193 14.5 12 14.5ZM12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" ></path>
    </svg>
)

const Line = ({className='fill-slate-800'}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" className={className}>
        <path fillRule="evenodd" clipRule="evenodd" d="M6.75146 15.1306V15.1306C6.7516 15.5448 6.41592 15.8807 6.0017 15.8808C5.58749 15.881 5.2516 15.5453 5.25146 15.1311C5.25142 14.9906 5.29183 13.8577 5.72195 12.7308C6.15161 11.6052 7.07875 10.2542 8.93625 10.2542C10.6713 10.2542 11.7208 10.8779 12.6242 11.4218L12.6343 11.4279C13.5029 11.9509 14.2064 12.3744 15.4163 12.3744C15.9048 12.3744 16.2194 12.1925 16.4573 11.9172C16.7183 11.6151 16.9063 11.1726 17.0283 10.6575C17.1484 10.1509 17.1911 9.63239 17.2023 9.23237C17.2078 9.03445 17.2055 8.87034 17.2019 8.75742C17.2001 8.70106 17.198 8.65774 17.1964 8.62967L17.1946 8.59935L17.1942 8.59372C17.1628 8.18088 17.4718 7.82024 17.8847 7.78861C18.2977 7.75696 18.6582 8.06611 18.6898 8.47911L17.942 8.53641C18.6898 8.47911 18.6898 8.47911 18.6898 8.47911L18.69 8.48178L18.6903 8.48614L18.6913 8.4998L18.6941 8.54621C18.6963 8.58534 18.6989 8.64059 18.7011 8.70969C18.7055 8.84767 18.7082 9.042 18.7017 9.27419C18.6888 9.73442 18.6397 10.3629 18.4879 11.0033C18.3382 11.6352 18.0746 12.3396 17.5923 12.8979C17.0869 13.4828 16.3665 13.8744 15.4163 13.8744C13.7881 13.8744 12.7801 13.267 11.9056 12.74C11.8871 12.7289 11.8688 12.7179 11.8505 12.7068C10.993 12.1906 10.2412 11.7542 8.93625 11.7542C8.00391 11.7542 7.46363 12.3742 7.12334 13.2657C6.95675 13.7022 6.86216 14.1544 6.80996 14.5155C6.78413 14.6942 6.76931 14.8461 6.76102 14.9566C6.75321 15.0608 6.75168 15.1221 6.75146 15.1306Z" ></path>
    </svg>
)

const GlobalEditing = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>
        <path d="M10.0775 22.0001C5.46844 21.0622 2 16.9869 2 12.1016C2 6.52267 6.5233 2.00006 12.1031 2.00006C16.9838 2.00006 21.0562 5.46049 22 10.0614" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M18.4332 13.8485C18.7685 13.4852 18.9362 13.3035 19.1143 13.1976C19.5442 12.9419 20.0736 12.934 20.5107 13.1766C20.6918 13.2772 20.8646 13.4537 21.2103 13.8068C21.5559 14.1599 21.7287 14.3364 21.8272 14.5215C22.0647 14.968 22.0569 15.5087 21.8066 15.9479C21.7029 16.1299 21.5251 16.3012 21.1694 16.6437L16.9378 20.7195C16.2638 21.3687 15.9268 21.6932 15.5056 21.8577C15.0845 22.0222 14.6214 22.0101 13.6954 21.9859L13.5694 21.9826C13.2875 21.9753 13.1466 21.9716 13.0646 21.8786C12.9827 21.7856 12.9939 21.642 13.0162 21.3548L13.0284 21.1989C13.0914 20.3907 13.1228 19.9865 13.2807 19.6233C13.4385 19.26 13.7107 18.965 14.2552 18.3751L18.4332 13.8485Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M20 5.69905C19.0653 5.76642 17.8681 6.1283 17.0379 7.20283C15.5385 9.14367 14.039 9.30562 13.0394 8.65867C11.5399 7.68826 12.8 6.11642 11.0401 5.26221C9.89313 4.70548 9.73321 3.19051 10.3716 2.00006" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M2 11.0001C2.7625 11.6622 3.83046 12.2683 5.08874 12.2683C7.68843 12.2683 8.20837 12.765 8.20837 14.7519C8.20837 16.7387 8.20837 16.7387 8.72831 18.2289C9.06651 19.1982 9.18472 20.1675 8.5106 21.0001" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
);

const Database = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"} {...props}>
        <ellipse cx="12" cy="5" rx="8" ry="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 10.842C7.60158 11.0229 8.27434 11.1718 9 11.282" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20 12C20 13.6569 16.4183 15 12 15C7.58172 15 4 13.6569 4 12" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 17.842C7.60158 18.0229 8.27434 18.1718 9 18.282" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M20 5V19C20 20.6569 16.4183 22 12 22C7.58172 22 4 20.6569 4 19V5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
);
const MenuDots = ({className='fill-slate-800'}) => (
    <svg width="20" height="20" viewBox="0 0 24 24" className={className}>
        <path fillRule="evenodd" clipRule="evenodd" d="M7 13.5C7.82843 13.5 8.5 12.8284 8.5 12C8.5 11.1716 7.82843 10.5 7 10.5C6.17157 10.5 5.5 11.1716 5.5 12C5.5 12.8284 6.17157 13.5 7 13.5ZM13.5 12C13.5 12.8284 12.8284 13.5 12 13.5C11.1716 13.5 10.5 12.8284 10.5 12C10.5 11.1716 11.1716 10.5 12 10.5C12.8284 10.5 13.5 11.1716 13.5 12ZM18.5 12C18.5 12.8284 17.8284 13.5 17 13.5C16.1716 13.5 15.5 12.8284 15.5 12C15.5 11.1716 16.1716 10.5 17 10.5C17.8284 10.5 18.5 11.1716 18.5 12Z"></path>
    </svg>
)


const CaretDownSolid = ({ className = "fill-slate-800", size = "12", onClick=() => {} }) => (
    <svg width={size} height={size} viewBox="0 0 320 512" className={className} onClick={onClick}>
        <path d="M137.4 374.6c12.5 12.5 32.8 12.5 45.3 0l128-128c9.2-9.2 11.9-22.9 6.9-34.9s-16.6-19.8-29.6-19.8L32 192c-12.9 0-24.6 7.8-29.6 19.8s-2.2 25.7 6.9 34.9l128 128z" />
    </svg>
);

const CaretUpSolid = ({ className = "fill-slate-800", size = "12", onClick=() => {} }) => (
    <svg width={size} height={size} viewBox="0 0 320 512" className={className} onClick={onClick}>
        <path d="M182.6 137.4c-12.5-12.5-32.8-12.5-45.3 0l-128 128c-9.2 9.2-11.9 22.9-6.9 34.9s16.6 19.8 29.6 19.8l256 0c12.9 0 24.6-7.8 29.6-19.8s2.2-25.7-6.9-34.9l-128-128z" />
    </svg>
);

const Plus = ({className='fill-slate-800', size="12"}) => (
    <svg width={size} height={size} viewBox="0 0 12 12" className={className}>
        <path d="M7 0H5V5H0V7H5V12H7V7H12V5H7V0Z" ></path>
    </svg>
)


const Eye = ({className='fill-gray-900', onClick=() => {} }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" className={className} onClick={onClick}>
        <path fillRule="evenodd" clipRule="evenodd" d="M15.1278 12C15.1278 13.6863 13.7274 15.0533 12 15.0533C10.2726 15.0533 8.8722 13.6863 8.8722 12C8.8722 10.3137 10.2726 8.94664 12 8.94664C13.7274 8.94664 15.1278 10.3137 15.1278 12ZM13.3717 12C13.3717 12.7395 12.7576 13.339 12 13.339C11.2424 13.339 10.6283 12.7395 10.6283 12C10.6283 11.2604 11.2424 10.6609 12 10.6609C12.7576 10.6609 13.3717 11.2604 13.3717 12Z" ></path>
        <path fillRule="evenodd" clipRule="evenodd" d="M12 18C7.90486 18 4.40498 15.512 3 12C4.40498 8.48798 7.90475 6 11.9999 6C16.095 6 19.595 8.48798 21 12C19.595 15.512 16.0951 18 12 18ZM11.9999 7.71429C15.1026 7.71429 17.7877 9.45991 19.0808 12C17.7877 14.5401 15.1027 16.2857 12 16.2857C8.89726 16.2857 6.21206 14.5401 4.91897 12C6.21206 9.45991 8.89715 7.71429 11.9999 7.71429Z" ></path>
    </svg>
)

const EyeClosed = ({className='fill-slate-800', onClick=() => {} }) => (
    <svg width="20" height="20" viewBox="0 0 24 24" className={className} onClick={onClick}>
        <path d="M3 12C3.34629 12.8656 3.81984 13.669 4.3982 14.3883L3.1051 15.6814L4.51932 17.0956L5.80754 15.8074C6.60111 16.4553 7.50288 16.9811 8.48252 17.3552L8.01453 19.1018L9.94638 19.6194L10.4142 17.8735C10.9301 17.9567 11.4599 18 12 18C12.5413 18 13.0722 17.9565 13.5892 17.873L14.0572 19.6194L15.989 19.1018L15.5207 17.354C16.4999 16.9796 17.4012 16.4537 18.1944 15.8058L19.4842 17.0956L20.8984 15.6814L19.6034 14.3863C20.181 13.6676 20.654 12.8648 21 12H19.0808C17.7877 14.5401 15.1027 16.2857 12 16.2857C8.89725 16.2857 6.21206 14.5401 4.91897 12H3Z" ></path>
    </svg>
)

const AccessControl = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={16} height={16} color={"#000000"} fill={"none"}{...props}>
        <path d="M17 10V9C17 5.70017 17 4.05025 15.9749 3.02513C14.9497 2 13.2998 2 10 2C6.70017 2 5.05025 2 4.02513 3.02513C3 4.05025 3 5.70017 3 9V15C3 18.2998 3 19.9497 4.02513 20.9749C5.05025 22 6.70017 22 10 22C10.3517 22 10.6846 22 11 21.9988" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15.5 16.5V15C15.5 13.8954 16.3954 13 17.5 13C18.6046 13 19.5 13.8954 19.5 15V16.5M16.75 22H18.25C19.4228 22 20.0092 22 20.4131 21.69C20.5171 21.6102 20.6102 21.5171 20.69 21.4131C21 21.0092 21 20.4228 21 19.25C21 18.0772 21 17.4908 20.69 17.0869C20.6102 16.9829 20.5171 16.8898 20.4131 16.81C20.0092 16.5 19.4228 16.5 18.25 16.5H16.75C15.5772 16.5 14.9908 16.5 14.5869 16.81C14.4829 16.8898 14.3898 16.9829 14.31 17.0869C14 17.4908 14 18.0772 14 19.25C14 20.4228 14 21.0092 14.31 21.4131C14.3898 21.5171 14.4829 21.6102 14.5869 21.69C14.9908 22 15.5772 22 16.75 22Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 19V19.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);
const Icons = {
  //---- Required Icons ----
  Default,
  Settings,
  Pages,
  Page,
  History,
  InsertSection: SquarePlus,
  Menu: MenuIcon,
  Blank,
  ViewPage: ViewIcon,
  EditPage: PencilEditSquare,
  Sections,
    // // Hazard Icons
    // riverine,
    // coastal, drought, hurricane, coldwave,
    // heatwave, hail, snowstorm, lightning,
    // tornado, wind, landslide, tsunami, volcano,
    // avalanche: snowflake,
    // wildfire: fire,
    // icestorm: ice,

    // "Extreme Cold": coldwave,
    // "Hail": hail,
    // "Avalanche": snowflake,
    // "Coastal Hazards": coastal,
    // "Drought": drought,
    // "Earthquake": earthquake,
    // "Extreme Heat": heatwave,
    // "Hurricane": hurricane,
    // "Ice Storm": ice,
    // "Landslide": landslide,
    // "Lightning": lightning,
    // "Flooding": riverine,
    // "Tornado": tornado,
    // "Tsunami/Seiche": tsunami,
    // "Volcano": volcano,
    // "Wildfire": fire,
    // "Wind": wind,
    // "Snowstorm": snowflake,
  //---- Optional Icons ----
  CaretDown,
  CaretUp,
  PencilEditSquare,
  ViewIcon,
  PencilIcon,
  CirclePlus,
  SquarePlus,
  WrenchIcon,
  SlidersIcon,
  MenuIcon,
  ClockIcon,
  InfoCircle,
  TrashCan,
  CircleCheck,
  RemoveCircle,
  CancelCircle,
  FloppyDisk,
  CirclePlusDot,
  PencilSquare,
  ArrowDownSquare,
  ArrowUpSquare,
  ChevronDownSquare,
  ChevronUpSquare,
  InfoSquare,
  MoreSquare,
  UserCircle,
  User,
  Tags,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowLeft,
  Copy,
  PDF,
  Printer,
  // Add,
  XMark,
  AdjustmentsHorizontal,
  LinkSquare,
  DraftPage,
  EllipsisVertical,
  Filter,
  LoadingHourGlass,
  TallyMark,
  LeftToRightListBullet,
  Sum,
  Avg,
  Group,
  SortAsc,
  SortDesc,
  Search,
  Download,
  GlobalEditing,
  Database,
  AccessControl
}


export default Icons
