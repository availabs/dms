'use strict';

import XMLHttpRequest from 'xhr2';
'use strict';
function getXMLHttpRequest() {
  return new XMLHttpRequest();
};

export default getXMLHttpRequest

// 'use strict';
// import xhr from 'xmlhttprequest';

// function getXMLHttpRequest() {
//   var request = new xhr.XMLHttpRequest();
//   request.setDisableHeaderCheck(true);
//   return request;
// };

// export default getXMLHttpRequest