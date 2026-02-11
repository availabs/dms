import React from "react"

const SymbologyManager = props => {

console.log("SymbologyManager::props", props)

	const { useTheme, ...rest } = props.useMapEditorContext();

	const { UI } = useTheme();

	const [num, setNum] = React.useState(0);

	React.useEffect(() => {
		if (!num) return;
		const sleep = async () => {
			await new Promise(res => {
				setTimeout(res, 5000);
			})
		}
		sleep().then(() => console.log("SLEEP FINISHED"));
		console.log("AFTER SLEEP");
	}, [num]);

console.log("OUTSIDE OF EFFECT", rest);

	return (
		<div className="w-full h-full relative">
			<div className="absolute inset-0 flex items-center justify-center">
				<button className="bg-gray-300 w-48 cursor-pointer py-1"
					onClick={ e => setNum(prev => prev + 1) }
				>
					test
				</button>
			</div>
		</div>
	)
}
export { SymbologyManager };