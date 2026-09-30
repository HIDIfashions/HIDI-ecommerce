import { useCallback, useEffect, useRef, useState } from "react";

export function useGrowthResource<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const alive = useRef(false);
  const currentLoad = useRef(load); currentLoad.current = load;
  const flight = useRef<Promise<void> | null>(null);
  const refresh = useCallback(() => {
    if (flight.current) return flight.current;
    setLoading(true); setError(false);
    const loader = currentLoad.current;
    flight.current = loader().then(value => {
      if (alive.current && currentLoad.current === loader) setData(value);
    }).catch(() => { if (alive.current && currentLoad.current === loader) setError(true); })
      .finally(() => { if (alive.current) setLoading(false); flight.current = null; });
    return flight.current;
  }, []);
  useEffect(() => {
    alive.current = true; void refresh();
    return () => { alive.current = false; };
  }, [refresh]);
  return { data, loading, error, refresh };
}
