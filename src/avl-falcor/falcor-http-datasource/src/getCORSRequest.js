//import xhr from 'xmlhttprequest'
import XMLHttpRequest from 'xhr2';
'use strict';
function getXMLHttpRequest() {
  return new XMLHttpRequest();
};

export default getXMLHttpRequest

/*'use strict';
// Get CORS support even for older IE
function getCORSRequest() {
    var request = null; 
    if(global.XMLHttpRequest) {
        //browser
        request =  new XMLHttpRequest()
    } else {
        // server
        request = new xhr.XMLHttpRequest()
    }   
    if ('withCredentials' in request) {
        return request;
    } else if (!!global.XDomainRequest) {
        return new XDomainRequest();
    } else {
        throw new Error('CORS is not supported by your browser');
    }
}

export default getCORSRequest*/