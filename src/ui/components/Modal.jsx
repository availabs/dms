import React, {Fragment} from "react";

export default function({open, setOpen, initialFocus, children}) {
    return (
        <Transition.Root show={open} as={Fragment}>
            <Headless.Dialog as="div" className="relative z-30" initialFocus={initialFocus} onClose={setOpen}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" />
                </Transition.Child>

                <div className="fixed inset-0 z-10 overflow-y-auto" >
                    <div
                        onClick={() =>  {setOpen(false);}}
                        className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0"
                    >
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                            enterTo="opacity-100 translate-y-0 sm:scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                        >
                            <Headless.DialogPanel className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                                {children}
                            </Headless.DialogPanel>
                        </Transition.Child>
                    </div>
                </div>
            </Headless.Dialog>
        </Transition.Root>
    )
}