export const button = [
// add base styles
	{ $default: "rounded inline-block @transition disabled:cursor-not-allowed",
		Text: "rounded inline-flex items-center justify-center @transition disabled:cursor-not-allowed"
 	},
// add bg colors
	{ $default: "@bgInput",
		Text: "@bg"
 	},
// add text colors
	{ $default: "@textButton",
		Primary: "@textPrimary",
		Success: "@textSuccess",
		Danger: "@textDanger",
		Info: "@textInfo",
		Dark: "@text",
	},
// add outline
	{ $default: "outline outline-1 @outlineButton",
		Primary: "outline outline-1 @outlinePrimary",
		Success: "outline outline-1 @outlineSuccess",
		Danger: "outline outline-1 @outlineDanger",
		Info: "outline outline-1 @outlineInfo",
		Dark: "outline outline-1 @outline",
		Text: "",
	},
// add hover
	{ $default: "@bgButtonHover @textContrastHover",
		Primary: "@bgPrimaryHover @textContrastHover",
		Success: "@bgSuccessHover @textContrastHover",
		Danger: "@bgDangerHover @textContrastHover",
		Info: "@bgInfoHover @textContrastHover",
		Dark: "@bgContrastHover @textContrastHover",
		Text: "@bgInputHover",
	},
// add disabled effect
	{ $default: "disabled:bg-opacity-50 disabled:hover:@bgInput disabled:hover:bg-opacity-50",
		Text: "disabled:bg-opacity-50 disabled:hover:@bg disabled:hover:bg-opacity-50"
	},
// add sizing
	{ $default: "@paddingBase @textBase",
		Large: "@paddingLarge @textLarge",
		Small: "@paddingSmall @textSmall",
	},
	{ Block: "w-full" }
]
export const input = [
	{ $default: `w-full block rounded @transition @text
							cursor-pointer disabled:cursor-not-allowed
							focus:outline-1 focus:outline focus:outline-current
							hover:outline-1 hover:outline hover:outline-gray-300`
	},
	{ $default: "@paddingBase @textBase",
		Large: "@paddingLarge @textLarge",
		Small: "@paddingSmall @textSmall",
	}
]
export const $compositions = {
	button,
	input
}
