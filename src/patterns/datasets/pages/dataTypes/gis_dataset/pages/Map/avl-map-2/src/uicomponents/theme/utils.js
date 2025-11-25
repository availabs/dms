const compose = (className, theme) => {
	return className.split(/\s+/).map(className => {
		const [base, ...rest] = className.split(/(?<!^)(?=[A-Z])/);

		if (!(theme.$compositions && theme.$compositions[base])) {
			return theme[base] || className;
		}

		return theme.$compositions[base]
			.reduce((a, c) => {
				let option = c.$default || "";
				for (const opt of rest) {
					if (opt in c) {
						option = c[opt];
					}
				}
				a.push(option);
				return a;
			}, []).filter(Boolean).join(" ");
	}).filter(Boolean).join(" ");
}

export const composeTheme = theme => {
	const composedTheme = JSON.parse(JSON.stringify(theme));

  const atRegex = /^.*[@](.+)\s*/;

	for (const key in composedTheme) {
		if (key === "$compositions") continue;

		const classNames = composedTheme[key].split(/\s+/);

		composedTheme[key] = classNames.map(c => {
			const match = atRegex.exec(c);
			if (match) {
				const [, key] = match;
				return o.replace(`@${ key }`, composedTheme[key]);
			}
			return c;
		}).join(" ")
	}

	if (composedTheme.$compositions) {
		for (const type in composedTheme.$compositions) {
			composedTheme.$compositions[type].forEach(options => {
				for (let option in options) {
					options[option] = options[option].split(/\s+/).map(o => {
						const match = atRegex.exec(o);
						if (match) {
							const [, key] = match;
							return o.replace(`@${ key }`, composedTheme[key]);
						}
						return o;
					}).join(" ");
					const $regex = /^\$(.+)$/;
					const $match = $regex.exec(options[option]);
					if ($match) {
						const [, value] = $match;
						if (value in composedTheme) {
							options[option] = composedTheme[value];
						}
					}
				}
			});
		}
	}
	return composedTheme;
}

const handler = {
	get: (theme, definition, receiver) => {
		if (!(definition in theme)) {
			theme[definition] = compose(definition, theme);
		}
		return theme[definition];
	}
}

export const makeProxy = theme => {
	return new Proxy(theme, handler);
}
