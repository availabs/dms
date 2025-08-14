import { falcorGraph } from '@availabs/avl-falcor'
let falcor
// declare global {
//   var __falcor
// }
// // this makes the server keep the falcor object
// // which stores its own cache
// // so it doesn't make unneccary duplicate requests
// if (!global.__falcor) {
// 	// console.log('new falcor')
//   global.__falcor = falcorGraph('https://graph.availabs.org');
// }
//console.log('init falcor')
falcor =  falcorGraph('https://graph.availabs.org');

export { falcor };