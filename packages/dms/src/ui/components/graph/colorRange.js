import {get} from "lodash-es";
import {mapColors} from "./utils";

export const getColorRange = (size, name, reverse=false) => {
  let range = get(mapColors, [name, size], []).slice();

  if(reverse) {
    range.reverse()
  }
  return range
}
