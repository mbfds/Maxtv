/**
 * Telemetry and Monitoring Service
 * Deferred initialization for optimized Time-To-Interactive (TTI).
 */

export interface TelemetryReport {
  lcp?: number;
  inp?: number;
  cls?: number;
  ttfb?: number;
  fcp?: number;
  initializedAt: number;
}

let isInitialized = false;
let telemetryData: TelemetryReport = {
  initializedAt: 0
};

export async function initDeferredTelemetry(): Promise<void> {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;
  telemetryData.initializedAt = Date.now();

  // Lazy import web-vitals dynamically so it doesn't block the initial main bundle
  try {
    const { onCLS, onINP, onLCP, onTTFB, onFCP } = await import('web-vitals');

    onCLS((metric) => {
      telemetryData.cls = metric.value;
    });

    onINP((metric) => {
      telemetryData.inp = metric.value;
    });

    onLCP((metric) => {
      telemetryData.lcp = metric.value;
    });

    onTTFB((metric) => {
      telemetryData.ttfb = metric.value;
    });

    onFCP((metric) => {
      telemetryData.fcp = metric.value;
    });

    console.debug('[TTI Telemetry] Bibliotecas de monitoramento e Web Vitals inicializadas após o carregamento da grade principal.');
  } catch (err) {
    console.debug('[TTI Telemetry] Web Vitals monitoring bypassed or unavailable:', err);
  }
}

export function getTelemetryData(): TelemetryReport {
  return telemetryData;
}
