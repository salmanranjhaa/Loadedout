import { useEffect, useRef, useState } from "react";
import { T } from "../../design/tokens";
import { workoutAPI } from "../../utils/api";
import { fmtSecs } from "../../utils/workouts";
import { LineSvg } from "../health/charts";

// Real map tiles from OpenFreeMap (OpenStreetMap data): no key, no account.
// MapLibre is loaded only when a workout with a route is opened.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
const FAST_TO_SLOW = ["#27E0B9", "#FFB454", "#FF647E"];

function mix(a, b, t) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

// Colour the route by pace (or speed) along its length; one colour without either
function routeGradient(streams, fallback) {
  const dist = streams?.distance_km || [];
  const pace = streams?.pace_s_per_km || (streams?.speed_kmh || []).map((v) => (v ? 3600 / v : null));
  const total = dist[dist.length - 1];
  const pts = dist.map((d, i) => [d / total, pace[i]]).filter(([p, v]) => v && p >= 0 && p <= 1);
  if (!total || pts.length < 4) return ["interpolate", ["linear"], ["line-progress"], 0, fallback, 1, fallback];
  const sorted = pts.map(([, v]) => v).sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * 0.1)], hi = sorted[Math.floor(sorted.length * 0.9)];
  const stops = [];
  let last = -1;
  pts.filter((_, i) => i % Math.ceil(pts.length / 60) === 0).forEach(([p, v]) => {
    if (p <= last) return;
    const t = Math.min(1, Math.max(0, (v - lo) / Math.max(1, hi - lo)));
    stops.push(p, t < 0.5 ? mix(FAST_TO_SLOW[0], FAST_TO_SLOW[1], t * 2) : mix(FAST_TO_SLOW[1], FAST_TO_SLOW[2], (t - 0.5) * 2));
    last = p;
  });
  return ["interpolate", ["linear"], ["line-progress"], ...stops];
}

function dot(color) {
  const el = document.createElement("div");
  el.style.cssText = `width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #0A0B10;box-shadow:0 0 0 1px ${color}`;
  return el;
}

export default function RouteMap({ workoutId, color = T.amber }) {
  const [track, setTrack] = useState(null);
  const box = useRef(null);

  useEffect(() => { workoutAPI.track(workoutId).then(setTrack).catch(() => setTrack(false)); }, [workoutId]);

  useEffect(() => {
    if (!track?.route?.length || !box.current) return;
    let map, gone = false;
    (async () => {
      const [{ default: maplibregl }] = await Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl.css")]);
      if (gone) return;
      const coords = track.route.map(([lat, lon]) => [lon, lat]);
      const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
      map = new maplibregl.Map({
        container: box.current, style: MAP_STYLE, bounds, fitBoundsOptions: { padding: 30 },
        attributionControl: { compact: true }, cooperativeGestures: true,   // the sheet still scrolls with one finger
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        map.addSource("route", { type: "geojson", lineMetrics: true, data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } } });
        const layout = { "line-cap": "round", "line-join": "round" };
        map.addLayer({ id: "route-edge", type: "line", source: "route", layout, paint: { "line-color": "#0A0B10", "line-width": 7 } });
        map.addLayer({ id: "route", type: "line", source: "route", layout, paint: { "line-width": 4, "line-gradient": routeGradient(track.streams, color) } });
        new maplibregl.Marker({ element: dot(T.teal) }).setLngLat(coords[0]).addTo(map);
        new maplibregl.Marker({ element: dot(T.negative) }).setLngLat(coords[coords.length - 1]).addTo(map);
        // Credits stay one tap away (ⓘ) instead of covering the route
        box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
      });
    })();
    return () => { gone = true; map?.remove(); };
  }, [track]);

  if (!track) return null;
  const s = track.streams || {};
  const dist = s.distance_km || [];
  const total = dist[dist.length - 1] || 0;
  const rows = [
    ["Pace /km", s.pace_s_per_km, T.amber, (v) => fmtSecs(v), "lower is faster"],
    ["Speed", s.speed_kmh, T.sky, (v) => `${v} km/h`, null],
    ["Heart rate", s.hr, T.negative, (v) => `${v} bpm`, null],
    ["Elevation", s.elevation_m, T.textMuted, (v) => `${Math.round(v)} m`, null],
    ["Cadence", s.cadence, T.violet, (v) => `${v} spm`, null],
    ["Power", s.power_w, T.orange, (v) => `${v} W`, null],
  ].filter(([, values]) => values?.some((v) => v != null));

  return (
    <>
      {track.route?.length > 1 && (
        <div ref={box} style={{ height: 230, flexShrink: 0, borderRadius: T.rCard, overflow: "hidden", border: `1px solid ${T.border}`, background: "#141a24" }} />
      )}
      {total > 0 && rows.length > 0 && (
        <div style={{ background: T.elevated, border: `1px solid ${T.border}`, borderRadius: T.rCard, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.textMuted, letterSpacing: 0.8, textTransform: "uppercase" }}>Along the route</div>
          {rows.map(([label, values, c, fmt, hint]) => {
            const pts = dist.map((d, i) => [d, values[i]]).filter(([, v]) => v != null);
            const ys = pts.map(([, v]) => v);
            const lo = Math.min(...ys), hi = Math.max(...ys);
            return (
              <div key={label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                  <span style={{ color: c, fontWeight: 600 }}>{label}{hint && <span style={{ color: T.textDim, fontWeight: 400 }}> · {hint}</span>}</span>
                  <span style={{ color: T.textDim, fontFamily: T.fontMono }}>{fmt(lo)} – {fmt(hi)}</span>
                </div>
                <LineSvg points={pts} xMax={total} yMin={lo - (hi - lo) * 0.1} yMax={hi + (hi - lo) * 0.1} color={c} height={58}
                         gap={Math.max(0.2, total / 20)} fill={label === "Elevation"} />
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, color: T.textDim, fontFamily: T.fontMono }}>
            <span>0 km</span><span>{Math.round(total * 100) / 100} km</span>
          </div>
        </div>
      )}
    </>
  );
}
