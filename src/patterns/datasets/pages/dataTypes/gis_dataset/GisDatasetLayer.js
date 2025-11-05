//import React from "react";
// import get from "lodash/get";
// import mapboxgl from "mapbox-gl";

import { LayerContainer } from "~/modules/avl-maplibre/src";

class GisDatasetLayer extends LayerContainer {
  legend = {
    type: "quantile",
    domain: [0, 150],
    range: [],
    format: ".2s",
    show: false,
    Title: "",
  };

  onHover = {
    layers: this.layers.map((d) => d.id),
    callback: (layerId, features, _lngLat) => {
      let feature = features[0];

      //console.log('hover', v)
      let data = [
        ...Object.keys(feature.properties).map((k) => [
          k,
          feature.properties[k],
        ]),
      ];
      data.push(["hoverlayer", layerId]);
      //data.push([this.getMeasure(this.filters), v])

      return data;
    },
  };

  init(_map, _falcor) {
    //console.log('hello options', options)
    //console.log('----init----', this)
    // return falcor
    //   .get(["geo", "36", "geoLevels"])
  }

  render(_map) {
    //console.log('render')
  }
}

const GisDatasetFactory = (options = {}) => new GisDatasetLayer(options);
export default GisDatasetFactory;

