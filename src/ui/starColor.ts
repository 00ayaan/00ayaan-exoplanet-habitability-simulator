/**
 * Approximate apparent color of a blackbody at temperature T (K), for drawing only.
 * Piecewise fit to the blackbody sRGB locus (after T. Helland's widely used
 * approximation). Visual aid, not colorimetry.
 */
export function blackbodyColor(teff_K: number): string {
  const t = Math.min(40000, Math.max(1000, teff_K)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}
