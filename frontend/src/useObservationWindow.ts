import {useCallback, useEffect, useRef, useState} from 'react';
import type {Analysis} from './lib/science';
import {calculateObservationWindow, loadObservationShard, novemberWindow, shardsForWindow} from './lib/observationEphemeris';

type Window = {start: string; end: string; analyses: Analysis[]};
type Status = 'loading' | 'error' | null;

export function useObservationWindow(initial: Analysis[]) {
  const [applied, setApplied] = useState<Window | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const request = useRef(0);
  useEffect(() => () => {request.current++;}, []);

  const select = useCallback(async (start: string, end: string) => {
    const current = ++request.current;
    try {
      const required = shardsForWindow(start, end);
      if (required.length) setStatus('loading');
      const source = required.length ? await Promise.all(required.map(loadObservationShard)) : [];
      if (request.current !== current) return;
      const analyses = calculateObservationWindow(initial, start, end, source);
      setApplied({start, end, analyses});
      setStatus(null);
    } catch {
      if (request.current === current) setStatus('error');
    }
  }, [initial]);

  return {window: applied ?? {...novemberWindow, analyses: initial}, status, select};
}
