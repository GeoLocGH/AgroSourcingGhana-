
import { useState, useEffect, useCallback } from 'react';
import type { GeoLocation } from '../types';

interface GeolocationState {
  location: GeoLocation | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export const useGeolocation = (): GeolocationState => {
  const [state, setState] = useState<{
    location: GeoLocation | null;
    loading: boolean;
    error: string | null;
  }>({
    location: null,
    loading: true,
    error: null,
  });

  // Trigger state to force re-running the effect
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({
        location: null,
        loading: false,
        error: "Geolocation is not supported by your browser.",
      });
      return;
    }

    // Reset state on retry
    setState(prev => ({ ...prev, loading: true, error: null }));

    let isMounted = true;

    const onSuccess = (position: GeolocationPosition) => {
      if (isMounted) {
        setState({
          location: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          loading: false,
          error: null,
        });
      }
    };

    const onError = (error: GeolocationPositionError) => {
      if (isMounted) {
        let msg = error.message;
        if (error.code === error.TIMEOUT) msg = "Location request timed out. Weak GPS signal.";
        if (error.code === error.PERMISSION_DENIED) msg = "Location permission denied. Please enable in settings.";
        if (error.code === error.POSITION_UNAVAILABLE) msg = "Location unavailable.";
        
        setState({
          location: null,
          loading: false,
          error: msg,
        });
      }
    };

    // Strategy: 
    // 1. Try High Accuracy (GPS) with 20s timeout (increased from 10s).
    // 2. If Timeout or Unavailable, fallback to Low Accuracy (Network) with 20s timeout.
    
    const highAccuracyOptions: PositionOptions = {
        enableHighAccuracy: true,
        timeout: 20000, 
        maximumAge: 300000 // 5 minutes cache
    };

    const lowAccuracyOptions: PositionOptions = {
        enableHighAccuracy: false, // Network/Wifi location
        timeout: 20000,
        maximumAge: 600000 // 10 minutes cache
    };

    navigator.geolocation.getCurrentPosition(
        onSuccess,
        (err) => {
            if (!isMounted) return;
            // Fallback logic
            if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
                console.log("High accuracy failed, falling back to network location...");
                navigator.geolocation.getCurrentPosition(
                    onSuccess, 
                    onError, 
                    lowAccuracyOptions
                );
            } else {
                onError(err);
            }
        },
        highAccuracyOptions
    );

    return () => { isMounted = false; };
  }, [attempt]); // Re-run when 'attempt' changes

  return { ...state, retry };
};
