import {useCallback, useEffect, useRef, useState} from 'react';
import type {Analysis} from './lib/science';
import {novemberWindow} from './lib/observationEphemeris';
import {loadHybridWindow, type ScienceSource} from './lib/hybridScience';
import {backendBaseUrl} from './backendConfig';

type Window = {start: string; end: string; analyses: Analysis[]};
type Status = 'loading' | 'error' | null;

export function useObservationWindow(initial: Analysis[], autoStart = novemberWindow.start, autoEnd = novemberWindow.end) {
  const [applied, setApplied] = useState<Window | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [source, setSource] = useState<ScienceSource>('cache');
  const [reason, setReason] = useState<string | null>(null);
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const select = useCallback(async (start: string, end: string) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const current = ++request.current;
    setStatus('loading');
    setReason(null);
    try {
      const result = await loadHybridWindow(initial, start, end, {signal: abort.signal, baseUrl: backendBaseUrl});
      if (request.current !== current || abort.signal.aborted) return;
      setApplied({start, end, analyses: result.analyses});
      setSource(result.source);
      setReason(result.reason);
      setStatus(null);
    } catch (error) {
      if (request.current !== current || abort.signal.aborted) return;
      setStatus('error');
      setReason(error instanceof Error ? error.message : 'Scientific data unavailable');
    }
  }, [initial]);

  useEffect(() => {
    if (initial.length) void select(autoStart, autoEnd);
    return () => {request.current++; controller.current?.abort();};
  }, [initial, select, autoStart, autoEnd]);

  return {window: applied ?? {...novemberWindow, analyses: initial}, status, source, reason, select};
}
