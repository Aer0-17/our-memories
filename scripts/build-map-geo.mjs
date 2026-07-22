// Offline pre-projection for the WeChat miniprogram footprint map.
//
// The web app renders the China map with d3-geo + <svg> at runtime. The
// miniprogram has neither SVG nor d3-geo, and shipping the 582KB raw GeoJSON
// is wasteful. So we project + simplify once here (Node + d3-geo) and emit a
// compact JSON of pixel-space province rings, city points, and the South China
// Sea inset. The miniprogram uses these rings to build native map polygons.
//
// Run: npm run map:geo

import { geoArea, geoMercator } from "d3-geo";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Must match the web ChinaMap projection extent so points line up 1:1.
const WIDTH = 1100;
const HEIGHT = 860;
const PADDING = 24;
const SIMPLIFY_TOLERANCE = 0.6; // pixels
const DEG2RAD = Math.PI / 180;

const geoPath = path.join(repoRoot, "apps/web/data/china-geo.json");
const provincesPath = path.join(repoRoot, "apps/web/data/provinces.ts");
const citiesPath = path.join(repoRoot, "apps/web/data/cities.ts");
const outPath = path.join(repoRoot, "apps/miniprogram/src/assets/geo/china-map.json");
const dataOutPath = path.join(repoRoot, "apps/miniprogram/src/assets/geo/china-data.json");

// --- Parse the shared data tables straight from the TS source (single source of truth) ---

function parseProvinces(source) {
  const map = new Map(); // adcode -> id
  const list = []; // { id, name }
  const re = /\{\s*id:\s*"([^"]+)",\s*adcode:\s*(\d+),\s*name:\s*"([^"]*)",/g;
  let match;
  while ((match = re.exec(source))) {
    map.set(Number(match[2]), match[1]);
    list.push({ id: match[1], name: match[3] });
  }
  return { map, list };
}

function parseCities(source) {
  const cities = [];
  const re =
    /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]*)",\s*nameEn:\s*"[^"]*",\s*provinceId:\s*"([^"]+)",\s*landmark:\s*"[^"]*",\s*lng:\s*([\d.]+),\s*lat:\s*([\d.]+)\s*\}/g;
  let match;
  while ((match = re.exec(source))) {
    cities.push({
      id: match[1],
      name: match[2],
      provinceId: match[3],
      lng: Number(match[4]),
      lat: Number(match[5]),
    });
  }
  return cities;
}

// --- Winding fix (ported from web lib/geo.ts) ---

function fixWinding(feature) {
  if (geoArea(feature) <= 2 * Math.PI) return feature;
  const reverseRing = (ring) => ring.slice().reverse();
  if (feature.geometry.type === "Polygon") {
    return {
      ...feature,
      geometry: { type: "Polygon", coordinates: feature.geometry.coordinates.map(reverseRing) },
    };
  }
  if (feature.geometry.type === "MultiPolygon") {
    return {
      ...feature,
      geometry: {
        type: "MultiPolygon",
        coordinates: feature.geometry.coordinates.map((polygon) => polygon.map(reverseRing)),
      },
    };
  }
  return feature;
}

// --- Douglas-Peucker on pixel rings ---

function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  return Math.hypot(p[0] - cx, p[1] - cy);
}

function simplify(points, tolerance) {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i += 1) {
    const dist = perpDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      index = i;
    }
  }
  if (maxDist > tolerance) {
    const left = simplify(points.slice(0, index + 1), tolerance);
    const right = simplify(points.slice(index), tolerance);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

const round = (value) => Number(value.toFixed(1));

// --- Load inputs ---

const rawChina = JSON.parse(fs.readFileSync(geoPath, "utf8"));
const { map: adcodeToProvinceId, list: provinceList } = parseProvinces(
  fs.readFileSync(provincesPath, "utf8"),
);
const cities = parseCities(fs.readFileSync(citiesPath, "utf8"));

if (adcodeToProvinceId.size === 0) throw new Error("Failed to parse provinces.ts");
if (cities.length === 0) throw new Error("Failed to parse cities.ts");

const chinaFeatures = rawChina.features
  .filter(
    (feature) =>
      adcodeToProvinceId.has(feature.properties.adcode) &&
      (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"),
  )
  .map(fixWinding);

const rawDashLine = rawChina.features.find(
  (feature) => String(feature.properties.adcode) === "100000_JD",
);
const dashLineFeature = rawDashLine ? fixWinding(rawDashLine) : null;

// --- Projection (matches web makeProjection) ---

const projection = geoMercator().fitExtent(
  [
    [PADDING, PADDING],
    [WIDTH - PADDING, HEIGHT - PADDING],
  ],
  { type: "FeatureCollection", features: chinaFeatures },
);

const k = projection.scale();
const [tx, ty] = projection.translate();

// Closed-form mercator forward, to be mirrored verbatim in the miniprogram so
// arbitrary lng/lat (future check-ins) project identically to build time.
function forward(lng, lat) {
  const x = lng * DEG2RAD;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * DEG2RAD) / 2));
  return [k * x + tx, ty - k * y];
}

// Self-check: the closed-form must equal d3's own projection within 0.01px.
let maxError = 0;
for (const city of cities) {
  const d3Point = projection([city.lng, city.lat]);
  if (!d3Point) continue;
  const mine = forward(city.lng, city.lat);
  maxError = Math.max(maxError, Math.hypot(d3Point[0] - mine[0], d3Point[1] - mine[1]));
}
if (maxError > 0.01) {
  throw new Error(`Projection formula mismatch: max error ${maxError.toFixed(4)}px`);
}

// --- Project province rings ---

function projectRings(feature) {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;

  const rings = [];
  for (const polygon of polygons) {
    // Only the outer ring of each polygon is needed for a filled silhouette.
    const outer = polygon[0];
    const projected = outer
      .map((coord) => projection(coord))
      .filter(Boolean)
      .map(([x, y]) => [x, y]);
    if (projected.length < 3) continue;
    const simplified = simplify(projected, SIMPLIFY_TOLERANCE).map(([x, y]) => [round(x), round(y)]);
    if (simplified.length >= 3) rings.push(simplified);
  }
  return rings;
}

const provincesOut = chinaFeatures.map((feature) => {
  const id = adcodeToProvinceId.get(feature.properties.adcode);
  const centroid = projection(feature.properties.centroid ?? feature.properties.center) ?? [0, 0];
  return {
    id,
    rings: projectRings(feature),
    centroid: [round(centroid[0]), round(centroid[1])],
  };
});

// --- Project all city points ---

const cityPoints = {};
for (const city of cities) {
  const point = projection([city.lng, city.lat]);
  if (point) cityPoints[city.id] = [round(point[0]), round(point[1])];
}

// --- Project the South China Sea dashed line inset (drawn separately) ---

let dashLine = [];
if (dashLineFeature) {
  const polygons =
    dashLineFeature.geometry.type === "Polygon"
      ? [dashLineFeature.geometry.coordinates]
      : dashLineFeature.geometry.coordinates;
  dashLine = polygons
    .map((polygon) =>
      simplify(
        polygon[0].map((coord) => projection(coord)).filter(Boolean),
        SIMPLIFY_TOLERANCE,
      ).map(([x, y]) => [round(x), round(y)]),
    )
    .filter((ring) => ring.length >= 2);
}

// --- Emit ---

const output = {
  width: WIDTH,
  height: HEIGHT,
  projection: { k: Number(k.toFixed(6)), tx: Number(tx.toFixed(4)), ty: Number(ty.toFixed(4)) },
  provinces: provincesOut,
  cityPoints,
  dashLine,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output));

// Emit the minimal cities/provinces tables (id/name/provinceId/lng/lat) so the
// miniprogram shares one source of truth with the web app instead of a copy.
const dataOutput = {
  provinces: provinceList,
  cities: cities.map((city) => ({
    id: city.id,
    name: city.name,
    provinceId: city.provinceId,
    lng: city.lng,
    lat: city.lat,
  })),
};
fs.writeFileSync(dataOutPath, JSON.stringify(dataOutput));

const bytes = fs.statSync(outPath).size;
const dataBytes = fs.statSync(dataOutPath).size;
const totalRingPoints = provincesOut.reduce(
  (sum, province) => sum + province.rings.reduce((acc, ring) => acc + ring.length, 0),
  0,
);
console.log(`Wrote ${outPath}`);
console.log(`  provinces: ${provincesOut.length}, city points: ${Object.keys(cityPoints).length}`);
console.log(`  ring points after simplify: ${totalRingPoints}`);
console.log(`  projection self-check max error: ${maxError.toFixed(5)}px`);
console.log(`  size: ${(bytes / 1024).toFixed(1)} KB`);
console.log(`Wrote ${dataOutPath}`);
console.log(`  cities: ${dataOutput.cities.length}, provinces: ${dataOutput.provinces.length}`);
console.log(`  size: ${(dataBytes / 1024).toFixed(1)} KB`);
