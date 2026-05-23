import { get } from "lodash-es";
import { mapColors } from "./utils";

export const getColorRange = (size, name, reverse=false) => {
  const range = get(mapColors, [name, size], []).slice();
  return reverse ? range.reverse() : range;
}
