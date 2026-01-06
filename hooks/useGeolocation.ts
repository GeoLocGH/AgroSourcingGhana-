import { useState, useEffect } from 'react';
import type { GeoLocation } from '../types';

interface GeolocationState {
  location: GeoLocation | null;
  loading: boolean;
  error: string | null;
}

export const useGeolocation = (): GeolocationState => {
  const [state, setState] = useState<GeolocationState>({
    location: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({
        location: null,
        loading: false,
        error: "Geolocation is not supported by your browser.",
      });
      return;
    }

    const onSuccess = (position: GeolocationPosition) => {
      setState({
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
        loading: false,
        error: null,
      });
    };

    const onError = (error: GeolocationPositionError) => {
      setState({
        location: null,
        loading: false,
        error: `Failed to get location: ${error.message}`,
      });
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
};