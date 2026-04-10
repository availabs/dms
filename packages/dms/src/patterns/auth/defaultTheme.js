const theme = {
    authPages: {
        container: `bg-[linear-gradient(0deg,rgba(244,244,244,0.96),rgba(244,244,244,0.96))]  bg-[size:500px] pb-[4px]`,//`bg-gradient-to-b from-[#F4F4F4] to-[#F4F4F4] bg-[url('/themes/mny/topolines.png')] `,
        wrapper1: 'w-full h-full flex-1 flex flex-col ', // first div inside Layout
        wrapper2: 'w-full h-full flex-1 flex flex-row p-4 min-h-screen', // inside page header, wraps sidebar
        wrapper3: 'flex flex-1 w-full border-2 flex-col border shadow-md rounded-lg relative text-md font-light leading-7 p-4 justify-content-center',
        iconWrapper: 'z-5 absolute right-[10px] top-[5px]',
        icon: 'text-slate-400 hover:text-blue-500',
        sectionGroup: {
            default: {
                wrapper1: "w-screen h-screen flex flex-row", // inside page header, wraps sidebar
                wrapper2: "flex w-screen h-screen justify-center",
                wrapper3: "w-full place-content-start md:place-content-center",
                iconWrapper: "z-5 absolute right-[10px] top-[5px] print:hidden",
                icon: "text-slate-400 hover:text-blue-500",
                sideNavContainer1: "hidden xl:block",
                sideNavContainer2:
                    "min-w-[302px] max-w-[302px] sticky top-20 hidden xl:block h-[100vh_-_102px] pr-2",
                pageWrapper: "max-w-lg mx-auto my-auto flex flex-col gap-[2vh] p-12 border border-blue-100 shadow-lg shadow-blue-150 rounded-lg",
                pageTitle: "font-medium text-blue-900 text-2xl leading-none tracking-normal uppercase",
                forgotPasswordText: "font-normal text-blue-500 text-sm leading-none tracking-normal underline decoration-solid",
                actionButton: "w-fit opacity-100 gap-2 rounded-full pt-4 pr-6 pb-4 pl-6 bg-blue-100 hover:bg-blue-200 cursor-pointer",
                actionText: "font-bold text-blue-900 text-xs leading-none tracking-normal text-center uppercase",
                prompt: "font-normal text-blue-500 text-sm leading-none tracking-normal flex gap-1",
            },
        },
    },
    field: {
        fieldWrapper: "flex flex-col gap-[2vh]",
        field: "flex flex-col gap-[1vh]",
        label: "font-semibold text-blue-800 text-sm leading-none tracking-normal"
    },
}

export default theme