import SideNav from "./Side";

const SideNavDocs = {
    name: "Side Nav",
    themeVar: "sidenav",
    description: "A responsive vertical navigation component.",
    props: [

        {
            name: "menuItems",
            type: "data",
            default: [],
        },
        {
            name: "topMenu",
            type: "Component",
            default: ''
        },
        {
            name: "bottomMenu",
            type: "Component",
            default: ''
        },
        {
            name: "mobile",
            type: "data",
            default: ''
        },
        {
            name: "subMenuActivate",
            type: "data",
            default: 'onClick'
        }
    ],
    dependencies: [
        {
            name: "Nav Item",
            theme: ["navitemSide", "navitemSideActive"],
        },
    ],
    examples: [
        {
            title: 'Side bar with icons',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <SideNav {...props} />
                </div>
            ),
            props: [
                {
                    name: 'mobile',
                    default: 'side'
                },
                {
                    name: "menuItems",
                    default: [

                        {
                            name: "Dashboard",
                            icon: "os-icon os-icon-layout",
                            active: true,
                        },
                        {
                            name: "Menu Styles",
                            icon: "os-icon os-icon-layers",
                        },

                        {
                            name: "Applications",
                            icon: "os-icon os-icon-package",
                        },
                        {
                            name: "Pages",
                            icon: "os-icon os-icon-file-text",
                        },
                        {
                            name: "UI Kit",
                            icon: "os-icon os-icon-life-buoy",
                        },

                        {
                            name: "Emails",
                            icon: "os-icon os-icon-mail",
                        },
                        {
                            name: "Users",
                            icon: "os-icon os-icon-users",
                        },
                        {
                            name: "Forms",
                            icon: "os-icon os-icon-edit-32",
                        },
                        {
                            name: "Tables",
                            icon: "os-icon os-icon-grid",
                        },
                        {
                            name: "Tables",
                            icon: "os-icon os-icon-zap",
                        },
                    ],
                },
                {
                    name: "topMenu",
                    default: (
                        <div className="flex items-center p-6 justify-start h-12">
                            <span className="text-lg font-medium uppercase">AVL Design</span>
                        </div>
                    )
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact'
                    }
                }
            ],
        },

        {
            title: 'Side bar without icons',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <SideNav {...props} />
                </div>
            ),
            props: [
                {
                    name: "menuItems",
                    type: "data",
                    default: [
                        {
                            name: "Layouts",
                            className: "font-light text-xs uppercase pl-6 text-blue-500 py-3",
                        },
                        {
                            name: "Dashboard",
                            active: true,
                        },
                        {
                            name: "Menu Styles",
                        },
                        {
                            name: "Options",
                            className: "font-light text-xs uppercase pl-6 text-blue-500 py-3",
                        },
                        {
                            name: "Applications",
                        },
                        {
                            name: "Pages",
                        },
                        {
                            name: "UI Kit",
                        },
                        {
                            name: "Elements",
                            className: "font-light text-xs uppercase pl-6 text-blue-500 py-3",
                        },
                        {
                            name: "Emails",
                        },
                        {
                            name: "Users",
                        },
                        {
                            name: "Forms",
                        },
                        {
                            name: "Tables",
                        },
                        {
                            name: "Tables",
                        },
                    ],
                },
            ],

        },

        {
            title: 'Nested Menu - onClick',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <SideNav {...props} />
                </div>
            ),
            props: [
                {
                    name: 'mobile',
                    default: 'side'
                },
                {
                    name: 'subMenuActivate',
                    default: 'onClick' // onClick, onHover, active
                },
                {
                    name: "menuItems",
                    default: [
                        {
                            name: "Dashboard",
                            icon: "os-icon os-icon-layout",
                            active: true,
                            subMenus: [
                                {
                                    name: "Menu with link",
                                    icon: "os-icon os-icon-layers",
                                    path: 'Table'
                                },

                                {
                                    name: "Sub Menu 2",
                                    icon: "os-icon os-icon-package",
                                },
                                {
                                    name: "Sub Menu 3",
                                    icon: "os-icon os-icon-file-text",
                                },
                            ]
                        },
                        {
                            name: "Menu Styles",
                            icon: "os-icon os-icon-layers",
                            path: 'Table'
                        },

                        {
                            name: "Applications",
                            icon: "os-icon os-icon-package",
                            subMenus: [
                                {
                                    name: "Sub Menu 1",
                                    icon: "os-icon os-icon-layers",
                                },

                                {
                                    name: "Sub Menu 2",
                                    icon: "os-icon os-icon-package",
                                },
                                {
                                    name: "Sub Menu 3",
                                    icon: "os-icon os-icon-file-text",
                                },
                            ]
                        },
                        {
                            name: "Pages",
                            icon: "os-icon os-icon-file-text",
                        },
                        {
                            name: "UI Kit",
                            icon: "os-icon os-icon-life-buoy",
                        },

                        {
                            name: "Emails",
                            icon: "os-icon os-icon-mail",
                        },
                        {
                            name: "Users",
                            icon: "os-icon os-icon-users",
                        },
                        {
                            name: "Forms",
                            icon: "os-icon os-icon-edit-32",
                        },
                        {
                            name: "Tables",
                            icon: "os-icon os-icon-grid",
                        },
                        {
                            name: "Tables",
                            icon: "os-icon os-icon-zap",
                        },
                    ],
                },
                {
                    name: "topMenu",
                    default: (
                        <div className="flex items-center p-6 justify-start h-12">
                            <span className="text-lg font-medium uppercase">AVL Design</span>
                        </div>
                    )
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact',
                        subMenuStyle: 'inline'
                    }
                }
            ],
        },

        {
            title: 'Nested Menu - Always Show',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <SideNav {...props} />
                </div>
            ),
            props: [
                {
                    name: 'mobile',
                    default: 'side'
                },
                {
                    name: 'subMenuActivate',
                    default: 'active' // onClick, onHover, active
                },
                {
                    name: "menuItems",
                    default: [
                        {
                            name: "Dashboard",
                            icon: "os-icon os-icon-layout",
                            active: true,
                            subMenus: [
                                {
                                    name: "Menu with link",
                                    icon: "os-icon os-icon-layers",
                                    path: 'Table'
                                },

                                {
                                    name: "Sub Menu 2",
                                    icon: "os-icon os-icon-package",
                                },
                                {
                                    name: "Sub Menu 3",
                                    icon: "os-icon os-icon-file-text",
                                },
                            ]
                        },
                        {
                            name: "Menu Styles",
                            icon: "os-icon os-icon-layers",
                            path: 'Table'
                        },

                        {
                            name: "Applications",
                            icon: "os-icon os-icon-package",
                            subMenus: [
                                {
                                    name: "Sub Menu 1",
                                    icon: "os-icon os-icon-layers",
                                },

                                {
                                    name: "Sub Menu 2",
                                    icon: "os-icon os-icon-package",
                                },
                                {
                                    name: "Sub Menu 3",
                                    icon: "os-icon os-icon-file-text",
                                },
                            ]
                        },
                        {
                            name: "Pages",
                            icon: "os-icon os-icon-file-text",
                        },
                        {
                            name: "UI Kit",
                            icon: "os-icon os-icon-life-buoy",
                        },

                        {
                            name: "Emails",
                            icon: "os-icon os-icon-mail",
                        },
                        {
                            name: "Users",
                            icon: "os-icon os-icon-users",
                        },
                        {
                            name: "Forms",
                            icon: "os-icon os-icon-edit-32",
                        },
                        {
                            name: "Tables",
                            icon: "os-icon os-icon-grid",
                        },
                        {
                            name: "Tables",
                            icon: "os-icon os-icon-zap",
                        },
                    ],
                },
                {
                    name: "topMenu",
                    default: (
                        <div className="flex items-center p-6 justify-start h-12">
                            <span className="text-lg font-medium uppercase">AVL Design</span>
                        </div>
                    )
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact',
                        subMenuStyle: 'inline'
                    }
                }
            ],
        },

        {
            title: 'Nested Menu - onHover',
            Component: (props) => (
                <div className="h-full w-full bg-gray-100">
                    <SideNav {...props} />
                </div>
            ),
            props: [
                {
                    name: 'mobile',
                    default: 'side'
                },
                {
                    name: 'subMenuActivate',
                    default: 'onHover' // onClick, onHover, active
                },
                {
                    name: "menuItems",
                    default: [
                        {
                            name: "Dashboard",
                            icon: "os-icon os-icon-layout",
                            active: true,
                            subMenus: [
                                {
                                    name: "Menu with link",
                                    icon: "os-icon os-icon-layers",
                                    path: 'Table'
                                },

                                {
                                    name: "Sub Menu 2",
                                    icon: "os-icon os-icon-package",
                                },
                                {
                                    name: "Sub Menu 3",
                                    icon: "os-icon os-icon-file-text",
                                },
                            ]
                        },
                        {
                            name: "Menu Styles",
                            icon: "os-icon os-icon-layers",
                            path: 'Table'
                        },

                        {
                            name: "Applications",
                            icon: "os-icon os-icon-package",
                            subMenus: [
                                {
                                    name: "Sub Menu 1",
                                    icon: "os-icon os-icon-layers",
                                },

                                {
                                    name: "Sub Menu 2",
                                    icon: "os-icon os-icon-package",
                                },
                                {
                                    name: "Sub Menu 3",
                                    icon: "os-icon os-icon-file-text",
                                },
                            ]
                        },
                        {
                            name: "Pages",
                            icon: "os-icon os-icon-file-text",
                        },
                        {
                            name: "UI Kit",
                            icon: "os-icon os-icon-life-buoy",
                        },

                        {
                            name: "Emails",
                            icon: "os-icon os-icon-mail",
                        },
                        {
                            name: "Users",
                            icon: "os-icon os-icon-users",
                        },
                        {
                            name: "Forms",
                            icon: "os-icon os-icon-edit-32",
                        },
                        {
                            name: "Tables",
                            icon: "os-icon os-icon-grid",
                        },
                        {
                            name: "Tables",
                            icon: "os-icon os-icon-zap",
                        },
                    ],
                },
                {
                    name: "topMenu",
                    default: (
                        <div className="flex items-center p-6 justify-start h-12">
                            <span className="text-lg font-medium uppercase">AVL Design</span>
                        </div>
                    )
                },
                {
                    name: 'themeOptions',
                    default: {
                        color: 'white',
                        size: 'compact',
                        subMenuStyle: 'inline'
                    }
                }
            ],
        },
    ],
};

export default SideNavDocs;
