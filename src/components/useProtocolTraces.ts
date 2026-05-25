import { useEffect, useState } from 'react';
import { getProtocolTraces, subscribeProtocolTraces } from '../lib/protocolTrace';
import type { ProtocolTraceEvent } from '../lib/protocolTrace';

export function useProtocolTraces(): ProtocolTraceEvent[] {
  const [traces, setTraces] = useState(() => getProtocolTraces());

  useEffect(() => {
    return subscribeProtocolTraces(() => setTraces(getProtocolTraces()));
  }, []);

  return traces;
}
