// src/pages/MapPage.jsx
import React from "react";
import MapLibreMap from "../components/map/MapLibreMap";  // <-- default import name matches JSX
import { fetchCrushers } from "../api";

export default function MapPage() {
  const [crushers, setCrushers] = React.useState([]);
  const HYB = "https://api.maptiler.com/maps/hybrid/style.json?key=vmxH20AIzRYazKKb0sEl";

  React.useEffect(() => {
    fetchCrushers().then(setCrushers).catch(console.error);
  }, []);

  return (
    <div className="flex-1 min-h-0 px-4 pb-4">
      <div className="w-full h-[calc(100vh-7.5rem)] rounded-xl border overflow-hidden relative z-0">
        <MapLibreMap
          crushers={crushers}
          initialCenter={[53.34, -6.26]}
          initialZoom={6}
          styleUrl={"https://api.maptiler.com/maps/hybrid/style.json?key=vmxH20AIzRYazKKb0sEl"}
          cubeColor={0xff007f}
          cubeSizeMeters={200}          // huge for visibility (tune down later)
          showGLPointsFallback={true}   // default true; you can set to false later
        />
      </div>
    </div>
  );
}
