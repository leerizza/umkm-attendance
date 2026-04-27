import { useEffect, useState } from "react";
import { MapPin, Search, LocateFixed, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export function LocationPicker({ lat, lng, onChange }: LocationPickerProps) {
  const [query, setQuery]           = useState("");
  const [results, setResults]       = useState<NominatimResult[]>([]);
  const [searching, setSearching]   = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [address, setAddress]       = useState("");

  // Reverse-geocode when lat/lng provided on initial load
  useEffect(() => {
    if (!lat || !lng || address) return;
    fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "id" } }
    )
      .then((r) => r.json())
      .then((d) => d.display_name && setAddress(d.display_name))
      .catch(() => {});
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  async function searchAddress() {
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=id`,
        { headers: { "Accept-Language": "id" } }
      );
      setResults(await res.json());
    } finally {
      setSearching(false);
    }
  }

  function selectResult(r: NominatimResult) {
    onChange(parseFloat(r.lat), parseFloat(r.lon));
    setAddress(r.display_name);
    setResults([]);
    setQuery("");
  }

  function useGPS() {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude, longitude } }) => {
        onChange(latitude, longitude);
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { "Accept-Language": "id" } }
          );
          const d = await res.json();
          if (d.display_name) setAddress(d.display_name);
        } catch {}
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  // Build OpenStreetMap embed URL
  const mapSrc = lat && lng
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.003},${lat - 0.002},${lng + 0.003},${lat + 0.002}&layer=mapnik&marker=${lat},${lng}`
    : null;

  return (
    <div className="space-y-3">
      {/* Search + GPS row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchAddress()}
            placeholder="Cari alamat kantor..."
            className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <Button size="sm" variant="outline" onClick={searchAddress} disabled={searching}>
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cari"}
        </Button>
        <Button size="sm" variant="outline" onClick={useGPS} disabled={gpsLoading} title="Gunakan lokasi saya">
          {gpsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LocateFixed className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {/* Search results dropdown */}
      {results.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => selectResult(r)}
              className={cn(
                "w-full text-left px-3 py-2.5 text-xs hover:bg-muted/60 transition-colors flex items-start gap-2",
                i > 0 && "border-t border-border"
              )}
            >
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <span className="line-clamp-2">{r.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Map preview */}
      {mapSrc ? (
        <div className="space-y-2">
          <iframe
            src={mapSrc}
            className="w-full h-48 rounded-xl border border-border"
            title="Lokasi Kantor"
          />
          {address && (
            <div className="flex items-start gap-1.5">
              <MapPin className="h-3 w-3 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">{address}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="h-48 rounded-xl border border-dashed border-border bg-muted/30 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <MapPin className="h-8 w-8 opacity-30" />
          <p className="text-xs">Cari alamat atau gunakan GPS</p>
        </div>
      )}
    </div>
  );
}
