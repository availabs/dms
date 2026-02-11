import React, { useEffect, useRef } from "react"

export const defaultColors = [
	'rgb(80, 149, 127)',
	'rgb(159, 161, 69)',
	'rgb(128, 182, 109)',
	'rgb(122, 168, 36)',
	'rgb(96, 117, 159)',
	'rgb(55, 124, 164)',
	'rgb(78, 139, 212)',
	'rgb(104, 198, 222)',
	'rgb(136, 154, 221)',
	'rgb(143, 125, 191)',
	'rgb(158, 101, 179)',
	'rgb(191, 105, 162)',
	'rgb(204, 98, 92)',
	'rgb(235, 147, 96)',
	'rgb(213, 176, 42)',
	'rgb(242, 218, 58)',
	'rgb(173, 122, 103)',
	'rgb(130, 100, 100)',
	// 'rgb(51, 51, 51)',
	'rgb(128, 128, 128)',
	'rgb(204, 204, 204)',
]

export const rgb2hex=c=> {
	if(!c || typeof c !== 'string'){
		c =  defaultColors[generateRandom(0, defaultColors.length-1)]
	}
	// console.log('test', c)
	let out = '#'+c.match(/\d+/g).map(x=>(+x).toString(16).padStart(2,0)).join``
	return out
}

const toRGB = (color) => {
    const { style } = new Option();
    style.color = color;
    return style.color;
}

export const toHex = (color) => rgb2hex(toRGB(color))

function getCircleLayer( layer_id, viewLayer) {
	const newColor = defaultColors[generateRandom(0, defaultColors.length-1)]
	return [
   		{
	      "id": layer_id,
	      "type": "circle",
	      "layout": {"visibility": "visible"},
	      "paint": {
	         "circle-color": newColor,
	         "circle-radius": 4,
	         "circle-stroke-color": RGB_Log_Shade(-0.4, newColor),
	         "circle-stroke-width": 1 
	      },
	      "source": `${viewLayer.source}_${layer_id}`,
	      "source-layer": viewLayer['source-layer']
	   }
	]
}

function getLineLayer( layer_id, viewLayer) {
	const newColor = defaultColors[generateRandom(0, defaultColors.length-1)]
	return [
   		{
	      "id": `${layer_id}_case`,
	      "type": "line",
	      "layout": {"visibility": "visible"},
	      "paint": {
	         "line-color": RGB_Log_Shade(-0.4, newColor),
	         "line-width": 3, 
	      },
	      "source": `${viewLayer.source}_${layer_id}`,
	      "source-layer": viewLayer['source-layer']
	   	},
   		{
	      "id": layer_id,
	      "type": "line",
	      "layout": {"visibility": "visible"},
	      "paint": {
	         "line-color": newColor,
	         "line-width": 3, 
	      },
	      "source": `${viewLayer.source}_${layer_id}`,
	      "source-layer": viewLayer['source-layer']
	   	}
	]
}

function getFillLayer( layer_id, viewLayer) {
	const newColor = defaultColors[generateRandom(0, defaultColors.length-1)]
	return [
   		{
	      "id": `${layer_id}_case`,
	      "type": "line",
	      "layout": {"visibility": "visible"},
	      "paint": {
	         "line-color": RGB_Log_Shade(-0.4, newColor),
	         "line-width": 1, 
	      },
	      "source": `${viewLayer.source}_${layer_id}`,
	      "source-layer": viewLayer['source-layer']
	    },
   	    {
	      "id": layer_id,
	      "type": "fill",
	      "layout": {"visibility": "visible"},
	      "paint": {
	         "fill-color": newColor,
	         "fill-opacity": 0.75, 
	      },
	      "source": `${viewLayer.source}_${layer_id}`,
	      "source-layer": viewLayer['source-layer']
	    }
	  
	]
}

export const getLayer = (layer_id, viewLayer) => {
	
	const layerByType = {
		fill: getFillLayer,
		line: getLineLayer,
		circle: getCircleLayer
	}

	let gotLayer = layerByType[viewLayer?.type] ? 
		layerByType[viewLayer?.type](layer_id, viewLayer) :
		[viewLayer]
	// console.log('gotlayer', gotLayer)
	return gotLayer
}


//-------------------
// rgb transform
// RGB_Log_Shade ( 0.42, color1 ); // rgb(20,60,200) + [42% Lighter] => rgb(166,171,225)
// RGB_Log_Shade ( -0.4, color5 ); // #F3A + [40% Darker] => #c62884
// RGB_Log_Shade ( 0.42, color8 ); // rgba(200,60,20,0.98631) + [42% Lighter] => rgba(225,171,166,0.98631)
// ---------------------------
const RGB_Log_Shade=(p,c)=>{
    var i=parseInt,r=Math.round,[a,b,c,d]=c.split(","),P=p<0,t=P?0:p*255**2,P=P?1+p:1-p;
    return"rgb"+(d?"a(":"(")+r((P*i(a[3]=="a"?a.slice(5):a.slice(4))**2+t)**0.5)+","+r((P*i(b)**2+t)**0.5)+","+r((P*i(c)**2+t)**0.5)+(d?","+d:")");
}



function generateRandom(min = 0, max = 100) {
	return Math.floor(  Math.random() * (max - min)) + min;
}

export const getValidSources = (sources, dama_host) => {
  return sources.map(src => {
  	let { id, source: { url, type } } = src;
    if(!url) return src; // postgres tiles have a differente structure
    if(url && url?.includes('.pmtiles')){
      url = url
        .replace("$HOST", dama_host)
        .replace('https://', 'pmtiles://')
        .replace('http://', 'pmtiles://')

    } else {
      url = url.replace("$HOST", dama_host)
    }
    
    return {
      id,
      source: {
        type,
        url: url
      }
    }
  });
}

export const usePrevious = (value) => {
  const ref = useRef();
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
};

export const categoricalColors = {
	"cat1": [
		'rgb(107, 184, 199)',
		'rgb(229, 102, 102)',
		'rgb(172, 114, 165)',
		'rgb(114, 172, 120)',
		'rgb(234, 147, 97)',
		'rgb(166, 140, 217)',
		'rgb(237, 190, 94)',
		'rgb(103, 203, 148)',
		'rgb(209, 152, 77)',
		'rgb(168, 169, 96)',
	],
	"cat2":[
		'rgb(234, 147, 97)',
		'rgb(136, 154, 221)',
		'rgb(198, 150, 88)',
		'rgb(139, 193, 168)',
		'rgb(225, 184, 81)',
		'rgb(206, 126, 168)',
		'rgb(184, 203, 128)',
		'rgb(152, 135, 196)',
		'rgb(223, 215, 129)',
		'rgb(148, 209, 152)'
	],
	"cat3":[
		'rgb(119, 170, 221)',
		'rgb(238, 136, 102)',
		'rgb(238, 221, 136)',
		'rgb(255, 170, 187)',
		'rgb(153, 221, 255)',
		'rgb(68, 187, 153)',
		'rgb(187, 204, 51)',
		'rgb(112, 128, 207)',
		'rgb(170, 170, 0)',
		'rgb(170, 68, 153)'
	],
	"cat4":[
		'rgb(155, 201, 69)',
		'rgb(138, 81, 158)',
		'rgb(228, 136, 7)',
		'rgb(195, 75, 143)',
		'rgb(46, 137, 194)',
		'rgb(60, 175, 154)',
		'rgb(249, 122, 113)',
		'rgb(223, 173, 22)',
		'rgb(116, 116, 205)',
		'rgb(179, 136, 86)'
	],
	"cat5":[
		'rgb(92, 107, 192)',
		'rgb(255, 167, 38)',
		'rgb(236, 64, 122)',
		'rgb(66, 165, 245)',
		'rgb(255, 112, 67)',
		'rgb(102, 187, 106)',
		'rgb(255, 213, 79)',
		'rgb(38, 166, 154)',
		'rgb(255, 138, 101)',
		'rgb(126, 87, 194)'
	],
	"cat6":[
		'rgb(204, 102, 119)',
		'rgb(51, 34, 136)',
		'rgb(221, 204, 119)',
		'rgb(17, 119, 51)',
		'rgb(136, 204, 238)',
		'rgb(136, 34, 85)',
		'rgb(68, 170, 153)',
		'rgb(153, 153, 51)',
		'rgb(170, 68, 153)',
		'rgb(238, 119, 51)'
	],
	"cat7": [
		'rgb(129, 144, 71)',
		'rgb(93, 106, 42)',
		'rgb(172, 114, 165)',
		'rgb(107, 71, 128)',
		'rgb(114, 127, 192)',
		'rgb(76, 89, 154)',
		'rgb(179, 126, 117)',
		'rgb(141, 87, 78)',
		'rgb(166, 140, 43)',
		'rgb(76, 141, 154)'
	],
	"cat8": [
		'rgb(255, 115, 87)',
		'rgb(255, 142, 66)',
		'rgb(255, 173, 41)',
		'rgb(249, 203, 21)',
		'rgb(147, 208, 83)',
		'rgb(40, 189, 140)',
		'rgb(7, 166, 171)',
		'rgb(64, 142, 191)',
		'rgb(107, 127, 184)',
		'rgb(138, 111, 165)'
	],
	"cat9": [
		'rgb(201, 63, 54)',
		'rgb(219, 96, 51)',
		'rgb(233, 125, 43)',
		'rgb(242, 154, 38)',
		'rgb(248, 187, 42)',
		'rgb(191, 202, 88)',
		'rgb(139, 179, 111)',
		'rgb(103, 158, 125)',
		'rgb(69, 130, 124)',
		'rgb(40, 109, 128)'
	]
}

export const rangeColors = {
//sequential
"seq1":["#f7e76e","#f5d65c","#f3c44c","#f1b33d","#eea030","#ea8b25","#e5751d","#df5d1a","#d8411b","#ce141f"],
"seq2":["#fde89b","#ffcf8a","#ffb681","#ff9e80","#f98686","#eb7190","#d4629c","#b458a7","#8a55b0","#4d53b3"],
"seq3":["#f2e68c","#cddb86","#a9cd84","#87bf84","#68b084","#4ba084","#319082","#1a7f7e","#066e77","#035d6d"],
"seq4":["#e8e873","#bbe37b","#8fdb88","#63d197","#3cc2a4","#1eb1ac","#1d9eb0","#2f88ae","#4071a7","#4b5899"],
"seq5":["#f3cdb4","#efbfa2","#e9b091","#e5a182","#e09273","#da8266","#d5725a","#cf624e","#c95045","#c33c3c"],
"seq6":["#f6e389","#f8d27b","#f8c072","#f7af6b","#f69d67","#f28c66","#ec7b66","#e46a69","#da5a6d","#cd4c71"],
"seq7":["#f2e9a6","#d9d798","#c2c58a","#abb47c","#95a26f","#809162","#6c8055","#586f49","#465e3d","#344e31"],
"seq8":["#d2e2a6","#bad69e","#a3c897","#8cbc91","#76af8b","#61a185","#4d9480","#39867a","#247874","#096b6d"],
"seq9":["#ebdbad","#d3d3a4","#bacc9d","#a2c39a","#8abb99","#72b199","#5ba79b","#469c9c","#33919d","#27859c"],
"seq10":["#d0f0da","#b5decd","#9bccc2","#82bab7","#6ba8ad","#5696a3","#448398","#35718d","#2b5f80","#274c72"],
"seq11":["#f3c0b9","#e9adad","#df9ba3","#d3899c","#c57797","#b46794","#a15991","#8b4d90","#71428f","#513a8d"],
"seq12":["#e9c5ed","#dcb4e2","#cea4d7","#bf94cd","#b185c2","#a275b8","#9466ae","#8557a5","#76499b","#663b91"],
// diverging
"div1":["#3166aa","#6482ba","#8ea0c9","#b5bfd8","#dcdfe7","#eedcdc","#eab7b6","#e29090","#d6696d","#c73d4b"],
"div2":["#2b8bab","#47a6b0","#73beb1","#a4d5b5","#d6eabf","#ebe5b2","#e8c68b","#e7a36e","#e47e5f","#dc565f"],
"div3":["#59a1a6","#7cb4a5","#9ec7a4","#c0d9a4","#e3eca3","#ece795","#dacc7b","#c9b062","#b79649","#a67b30"],
"div4":["#448480","#6c9978","#93ad6c","#bcc05c","#e4d445","#f7cc32","#f0ac2f","#e68b2f","#d96a34","#c54b3e"],
"div5":["#518646","#789a54","#9dad68","#c1c17e","#e6d494","#f4cf90","#edb172","#e69153","#df6e37","#d74528"],
"div6":["#8b4583","#a46b90","#bd919c","#d7b7a9","#efddb7","#e4e1b1","#bcc095","#949f7a","#6e7f60","#4a6147"],
}