import { useState, useCallback } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPosition = useCallback((): Promise<GeoPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const msg = "GPS tidak tersedia di perangkat ini";
        setError(msg);
        reject(new Error(msg));
        return;
      }

      setLoading(true);
      setError(null);

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const result: GeoPosition = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setPosition(result);
          setLoading(false);
          resolve(result);
        },
        (err) => {
          const msg =
            err.code === 1
              ? "Izin lokasi ditolak. Aktifkan GPS."
              : err.code === 2
              ? "Lokasi tidak tersedia"
              : "Timeout GPS. Coba lagi.";
          setError(msg);
          setLoading(false);
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10_000,
          maximumAge: 30_000,
        }
      );
    });
  }, []);

  return { position, loading, error, getPosition };
}
