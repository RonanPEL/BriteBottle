// src/components/map/MapLibreMap.jsx
import React, { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { loadPatchedStyle } from "./patchStyle";

/* ---------- coord helpers (robust + range-checked) ---------- */
const asNum = (v) => (v == null || v === "" ? NaN : Number(v));
const inLat = (v) => Number.isFinite(v) && v <= 90 && v >= -90;
const inLng = (v) => Number.isFinite(v) && v <= 180 && v >= -180;

function getLatCoord(c) {
  const candidates = [
    c?.lat, c?.latitude, c?.Lat, c?.Latitude,
    c?.location?.lat, c?.Location?.Lat,
    c?.coords?.lat
  ].map(asNum);
  for (const v of candidates) if (inLat(v)) return v;

  // fallback: y as degrees (ignore if clearly meters)
  const y = asNum(c?.y);
  if (inLat(y)) return y;

  return NaN;
}
function getLngCoord(c) {
  const candidates = [
    c?.lng, c?.long, c?.lon, c?.longitude,
    c?.Lng, c?.Long, c?.Lon, c?.Longitude,
    c?.location?.lng, c?.Location?.Lng,
    c?.coords?.lng
  ].map(asNum);
  for (const v of candidates) if (inLng(v)) return v;

  // fallback: x as degrees (ignore if clearly meters)
  const x = asNum(c?.x);
  if (inLng(x)) return x;

  return NaN;
}
const valid = (c) => inLat(getLatCoord(c)) && inLng(getLngCoord(c));

/* ---------- bounds helper ---------- */
function fitToPoints(map, pts, { padding = 60, maxZoom = 16 } = {}) {
  if (!map || !pts?.length) return false;
  const bounds = new maplibregl.LngLatBounds();
  pts.forEach((c) => bounds.extend([getLngCoord(c), getLatCoord(c)]));
  map.fitBounds(bounds, { padding, maxZoom });
  return true;
}

/* ---------- DOM red dot (18x18) ---------- */
function buildDot() {
  const el = document.createElement("div");
  el.style.width = "18px";
  el.style.height = "18px";
  el.style.borderRadius = "50%";
  el.style.background = "#ef4444"; // red-500
  el.style.boxShadow = "0 0 0 2px #ffffff, 0 1px 6px rgba(0,0,0,0.35)";
  el.style.pointerEvents = "auto"; // clickable
  el.style.userSelect = "none";
  return el;
}

/* ---------- Map component ---------- */
export default function MapLibreMap({
  styleUrl = "https://api.maptiler.com/maps/streets/style.json",
  center = { lng: -7.716, lat: 53.142 },     // Ireland
  zoom = 6,
  crushers = [],                              // array of objects with lat/lng-ish fields
  showLabels = false,
  onMarkerClick = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const domMarkersRef = useRef([]);
  const popupsRef = useRef([]);
  const fittedRef = useRef(false);
  const crushersRef = useRef([]);

  useEffect(() => { crushersRef.current = crushers; }, [JSON.stringify(crushers)]);

  // init / destroy map
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const key = (styleUrl.includes("maptiler.com") ? (import.meta?.env?.VITE_MAPTILER_KEY || "") : "");
      let patchedStyle = styleUrl;
      try {
        patchedStyle = await loadPatchedStyle(styleUrl, key);
      } catch (e) {
        console.warn("[MapLibreMap] style patch failed; using styleUrl directly:", e);
      }
      if (cancelled) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: patchedStyle,
        center: [center.lng ?? center.lon ?? center.long ?? 0, center.lat ?? 0],
        zoom,
        attributionControl: true,
        cooperativeGestures: false, // <-- disable Ctrl/Cmd + scroll requirement
      });

      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      mapRef.current = map;

      map.on("load", () => {
        const pts = (crushersRef.current || []).filter(valid);
        if (pts.length) {
          fitToPoints(map, pts);
          fittedRef.current = true;
        }
      });
    })();

    return () => {
      cancelled = true;
      // cleanup markers & popups
      domMarkersRef.current.forEach((m) => m.remove());
      domMarkersRef.current = [];
      popupsRef.current.forEach((p) => p.remove());
      popupsRef.current = [];
      // cleanup map
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      fittedRef.current = false;
    };
  }, []);

  // add/update markers when data or showLabels changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // remove existing
    domMarkersRef.current.forEach((m) => m.remove());
    domMarkersRef.current = [];
    popupsRef.current.forEach((p) => p.remove());
    popupsRef.current = [];

    const pts = (crushers || []).filter(valid);

    pts.forEach((c, idx) => {
      const lat = getLatCoord(c);
      const lng = getLngCoord(c);

      const el = buildDot();
      const marker = new maplibregl.Marker({
        element: el,
        anchor: "center",   // exact center of the 18x18 dot is the anchor
        offset: [0, 0],
      })
        .setLngLat([lng, lat])
        .addTo(map);

      if (onMarkerClick) {
        el.style.cursor = "pointer";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onMarkerClick(c, idx);
        });
      }

      domMarkersRef.current.push(marker);

      if (showLabels) {
        const labelText = c?.name ?? c?.label ?? `#${idx + 1}`;
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          anchor: "top",
          offset: 14,
          className: "ml-label",
        }).setHTML(`<div style="padding:2px 6px;font-size:12px;line-height:14px;color:#1f2937;background:rgba(255,255,255,0.95);border:1px solid rgba(0,0,0,0.08);border-radius:6px;pointer-events:none;white-space:nowrap;">${labelText}</div>`);

        marker.setPopup(popup).togglePopup(); // always open
        popupsRef.current.push(popup);
      }
    });

    // initial fit if not already done
    if (!fittedRef.current && pts.length) {
      if (fitToPoints(map, pts)) fittedRef.current = true;
    }
  }, [JSON.stringify(crushers), showLabels]);

  return (
    <div className="relative w-full h-full min-h-[400px]" style={{ minHeight: 400 }}>
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
