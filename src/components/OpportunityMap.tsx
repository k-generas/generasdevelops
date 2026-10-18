import { useEffect, useRef, useState } from "react";

export type RadarMapPoint = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  priority: number;
  needsVerification: boolean;
};

type MapsNs = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => { fitBounds: (b: unknown) => void };
  Marker: new (opts: Record<string, unknown>) => {
    addListener: (event: string, cb: () => void) => void;
  };
  Circle: new (opts: Record<string, unknown>) => unknown;
  LatLngBounds: new () => { extend: (p: { lat: number; lng: number }) => void };
};

let loader: Promise<void> | null = null;

// Loads the Maps JS API once, using the browser key already provided by the
// Lovable Maps connector. Never throws out of the render path.
function loadMapsScript(): Promise<void> {
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const key = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"];
    if (!key) {
      reject(new Error("The Google Maps browser key is not configured."));
      return;
    }
    const w = window as unknown as { google?: unknown; __gareRadarMaps?: () => void };
    if (w.google) {
      resolve();
      return;
    }
    w.__gareRadarMaps = () => resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__gareRadarMaps`;
    script.async = true;
    script.onerror = () => reject(new Error("Failed to load Google Maps."));
    document.head.appendChild(script);
  });
  return loader;
}

function zoomFor(radiusKm: number): number {
  if (radiusKm <= 1) return 14;
  if (radiusKm <= 5) return 12;
  if (radiusKm <= 25) return 10;
  return 9;
}

export function OpportunityMap({
  points,
  center,
  radiusKm,
  onSelect,
}: {
  points: RadarMapPoint[];
  center: { lat: number; lng: number } | null;
  radiusKm: number;
  onSelect?: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!center) return;
    loadMapsScript()
      .then(() => {
        if (cancelled || !ref.current) return;
        const w = window as unknown as { google?: MapsNs };
        const g = w.google;
        if (!g) throw new Error("Google Maps is unavailable.");
        const map = new g.Map(ref.current, {
          center,
          zoom: zoomFor(radiusKm),
          disableDefaultUI: true,
          streetViewControl: false,
          mapTypeControl: false,
        });
        new g.Circle({
          map,
          center,
          radius: radiusKm * 1000,
          strokeColor: "#059669",
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: "#059669",
          fillOpacity: 0.08,
        });
        const bounds = new g.LatLngBounds();
        bounds.extend(center);
        for (const p of points) {
          const marker = new g.Marker({
            map,
            position: { lat: p.lat, lng: p.lng },
            title: p.label,
          });
          if (onSelect) marker.addListener("click", () => onSelect(p.id));
          bounds.extend({ lat: p.lat, lng: p.lng });
        }
        if (points.length > 0) map.fitBounds(bounds);
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [points, center, radiusKm, onSelect]);

  if (!center) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Map unavailable: no verified coordinates for this area yet. Run a scan, or pick a business
        with a known location as the centre. The Cluster view still works without coordinates.
      </p>
    );
  }
  if (error) {
    return (
      <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {error} Use the Cluster view to see opportunity density instead.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <div ref={ref} className="h-80 w-full overflow-hidden rounded-lg border" />
      {!ready && <p className="text-xs text-muted-foreground">Loading map…</p>}
      <p className="text-xs text-muted-foreground">
        Showing {points.length} mapped {points.length === 1 ? "opportunity" : "opportunities"}{" "}
        within {radiusKm} km. Positions come from stored Google coordinates.
      </p>
    </div>
  );
}
