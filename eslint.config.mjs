import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginReactConfig from "eslint-plugin-react/configs/recommended.js";

// pluginReactConfig.rules["react/prop-types"] = 0
//pluginJs.configs.recommended.rules["no-unused-vars"] = "off"
//console.log("test 123", JSON.stringify(pluginJs.configs.recommended, null, 3))



export default [
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  pluginReactConfig,
  // overwrite of recommeneded rules cause nah
  {
    "rules": {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "react/prop-types": 0
    },
    "settings": {
      "react": {
        "version": "detect"
      }
    }
  }
];