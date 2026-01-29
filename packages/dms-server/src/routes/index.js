const { readdirSync, statSync } = require('fs');
const { join } = require("path");
const Router = require('../utils/falcor-router');

const regex = /routes?.js$/;

const getAllFiles = function(dirPath, arrayOfFiles) {
    let files = readdirSync(dirPath)
    arrayOfFiles = arrayOfFiles || []
    files.forEach(function(file) {
        if (statSync(join(dirPath, file)).isDirectory()) {
          getAllFiles(dirPath + "/" + file, arrayOfFiles)
        } else {
        	arrayOfFiles.push(join(dirPath, file))
        }
    })
    return arrayOfFiles
}

const routeFiles = getAllFiles(__dirname)
    .filter(file => regex.test(file))
    .reduce((routes, file) => routes.concat(require(file)), []);

const BaseRouter = Router.createClass(routeFiles);

class falcorRoutes extends BaseRouter {
  constructor(config) {
    super({ maxPaths: 4000000 });
    this.user = config.user;
  }
}

module.exports = (config = {}) => new falcorRoutes(config);
