(() => {
	const string = process.argv.at(2);
	console.log(`${ string } ${ (new Date()).toLocaleString() }`);
})();
