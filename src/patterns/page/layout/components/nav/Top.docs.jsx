import TopNav from "./Top";
//import { useTheme } from "../../wrappers";

export default {
	name: "Top Nav",
	themeVar: "topnav",
	description: "A responsive horizontal navigation component.",
	props: [
		{
			name: "menuItems",
			type: "Data",
			required: false,
			default: [],
			description: [
			'An array of Objects which represent the menu items for the nav.',
			// 'Keys',
			// '',
			// 'name - The name value displayed for the item',
			// 'icon - optional - Icon class names',
			// 'to - optional - link url. will be active if is current page',
			// 'active - optional - set item to active style'
			]
		},
		{
			name: "leftMenu",
			type: "Component",
			required: false,
			default: '',
		},
		{
			name: "rightMenu",
			type: "Component",
			default: '',
		},
		{
			name: "mobileLocation",
			type: "String",
			default: 'Top',
			required: false
		}
	],
	examples: [
		{
			Component: (props) => {
				return (
					<div className="h-full w-full bg-gray-100">
						<TopNav {...props} />
					</div>
				);
			},
			title: 'TopNav with icon, logo and login',
			props: [
				{
					name: "menuItems",
					default: [
						{
							name: "Hello",
							icon: "os-icon os-icon-layout",
							active: true,
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
					],
				},
				{
					name: "leftMenu",
					default: (
						<div className="flex items-center p-4 justify-center h-12">
							<span className="text-lg font-medium uppercase">AVL Design</span>
						</div>
					),
				},
				{
					name: "rightMenu",
					default: (
						<div className="flex items-center md:w-32 justify-center h-12 w-full hover:bg-gray-400 hover:text-white">
							<span className="text-sm cursor-pointer">Login</span>
						</div>
					),
				},
			],
			
			code: `
			import {TopNav} from "components/avl-components/src"; 
				
			const MyTopBar = (props) => {
				return (
					<div className="h-full w-full bg-gray-100">
								<TopNav {...props} />
						</div>
					);
			};			
			`,
		},

		{
			Component: (props) => {
				return (
					<div className="h-full w-full bg-gray-100">
						<TopNav {...props} />
					</div>
				);
			},
			title: 'TopNav without icon, logo and login',
			props: [
				{
					name: "menuItems",
					type: "data",
					default: [
						{
							name: "Hello",
							active: true,
						},

						{
							name: "Applications",
						},
						{
							name: "Pages",
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
					],
				},
			],
			code: `
			import {TopNav} from "components/avl-components/src"; 
				
			const MyTopBar = (props) => {
				return (
					<div className="h-full w-full bg-gray-100">
								<TopNav {...props} />
						</div>
					);
			};			
			`,
		},

		{
			Component: (props) => {
				return (
					<div className="h-full w-full bg-gray-100">
						<TopNav {...props} />
					</div>
				);
			},
			title: 'TopNav with icon, logo',
			props: [
				{
					name: "menuItems",
					type: "data",
					default: [
						{
							name: "Hello",
							icon: "os-icon os-icon-layout",
							active: true,
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
					],
				},
				{
					name: "leftMenu",
					type: "Component",
					default: (
						<div className="flex items-center p-4 justify-center h-12">
							<span className="text-lg font-medium uppercase">AVL Design</span>
						</div>
					),
				},
			],
			theme: ["sidebarWrapper"],
			dependencies: [
				{
					name: "Nav Item",
					theme: ["navitemTop", "navitemTopActive", "menuIcon", "menuIcon"],
				},
			],
			code: `
			import {TopNav} from "components/avl-components/src"; 
				
			const MyTopBar = (props) => {
				return (
					<div className="h-full w-full bg-gray-100">
								<TopNav {...props} />
						</div>
					);
			};			
			`,
		},

		{
			Component: (props) => {
				return (
					<div className="h-full w-full bg-gray-100">
						<TopNav {...props} />
					</div>
				);
			},
			title: 'TopNav with icon, login',
			props: [
				{
					name: "menuItems",
					type: "data",
					default: [
						{
							name: "Hello",
							icon: "os-icon os-icon-layout",
							active: true,
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
					],
				},
				{
					name: "rightMenu",
					type: "Component",
					default: (
						<div className="flex items-center md:w-32 justify-center h-12 w-full hover:bg-gray-400 hover:text-white">
							<span className="text-sm cursor-pointer">Login</span>
						</div>
					),
				},
			],
			theme: ["sidebarWrapper"],
			dependencies: [
				{
					name: "Nav Item",
					theme: ["navitemTop", "navitemTopActive", "menuIcon", "menuIcon"],
				},
			],
			code: `
			import {TopNav} from "components/avl-components/src"; 
				
			const MyTopBar = (props) => {
				return (
					<div className="h-full w-full bg-gray-100">
								<TopNav {...props} />
						</div>
					);
			};			
			`,
		},
	],
};
