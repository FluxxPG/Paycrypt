type CircuitState = {
  failures: number;
  openedAt: number | null;
  halfOpenProbeInFlight: boolean;
};

export type CircuitBreakerOptions = {
  failureThreshold?: number;
  openDurationMs?: number;
};

export class CircuitBreakerOpenError extends Error {
  constructor(public readonly key: string) {
    super(`Circuit breaker is open for ${key}`);
  }
}

const circuits = new Map<string, CircuitState>();

const getState = (key: string): CircuitState => {
  const existing = circuits.get(key);
  if (existing) return existing;
  const state: CircuitState = { failures: 0, openedAt: null, halfOpenProbeInFlight: false };
  circuits.set(key, state);
  return state;
};

export const withCircuitBreaker = async <T>(
  key: string,
  fn: () => Promise<T>,
  options: CircuitBreakerOptions = {}
): Promise<T> => {
  const failureThreshold = options.failureThreshold ?? 5;
  const openDurationMs = options.openDurationMs ?? 30_000;

  const state = getState(key);

  if (state.openedAt) {
    const elapsed = Date.now() - state.openedAt;
    if (elapsed < openDurationMs) {
      throw new CircuitBreakerOpenError(key);
    }

    if (state.halfOpenProbeInFlight) {
      throw new CircuitBreakerOpenError(key);
    }

    state.halfOpenProbeInFlight = true;
  }

  try {
    const result = await fn();
    state.failures = 0;
    state.openedAt = null;
    state.halfOpenProbeInFlight = false;
    return result;
  } catch (error) {
    state.halfOpenProbeInFlight = false;
    state.failures += 1;
    if (state.failures >= failureThreshold) {
      state.openedAt = Date.now();
    }
    throw error;
  }
};
