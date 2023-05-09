const eslintrc = require("eslint-config-react-app");

module.exports = {
  ...eslintrc,
  rules: {
    ...eslintrc.rules,
    "import/no-anonymous-default-export": "off"
  }
};
