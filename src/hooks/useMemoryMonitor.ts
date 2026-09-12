import { useState, useEffect, useCallback } from 'react';

export interface MemoryMonitorData {
  usedMB: number;
  totalMB: number;
  limitMB: number;
  percentUsed: number;
  isSupported: boolean;
  usedJSHeapSize: number;
}

export interface UseMemoryMonitorReturn {
  memory: MemoryMonitorData;
  isExceeded: boolean;
  thresholdMB: number;
  lastCleanedAt: string | null;
  clearMemoryAndCache: () => void;
  checkMemory: () => void;
}

export const DEFAULT_MEMORY_THRESHOLD_MB = 400;

/**
 * Hook para monitoramento contínuo de uso de memória JS (performance.memory.usedJSHeapSize).
 * Emite alerta caso o consumo exceda 400MB e disponibiliza rotina de limpeza de cache local
 * e desalocação de instâncias inativas.
 */
export function useMemoryMonitor(thresholdMB: number = DEFAULT_MEMORY_THRESHOLD_MB): UseMemoryMonitorReturn {
  const [memory, setMemory] = useState<MemoryMonitorData>({
    usedMB: 0,
    totalMB: 0,
    limitMB: 0,
    percentUsed: 0,
    isSupported: false,
    usedJSHeapSize: 0,
  });
  const [lastCleanedAt, setLastCleanedAt] = useState<string | null>(null);

  const checkMemory = useCallback(() => {
    try {
      const perf = typeof window !== 'undefined' ? (window.performance as any) : null;
      if (perf && perf.memory) {
        const usedBytes: number = perf.memory.usedJSHeapSize || 0;
        const totalBytes: number = perf.memory.totalJSHeapSize || 0;
        const limitBytes: number = perf.memory.jsHeapSizeLimit || 1;

        const usedMB = Math.round((usedBytes / (1024 * 1024)) * 10) / 10;
        const totalMB = Math.round((totalBytes / (1024 * 1024)) * 10) / 10;
        const limitMB = Math.round((limitBytes / (1024 * 1024)) * 10) / 10;
        const percentUsed = Math.min(100, Math.round((usedBytes / limitBytes) * 100));

        setMemory({
          usedMB,
          totalMB,
          limitMB,
          percentUsed,
          isSupported: true,
          usedJSHeapSize: usedBytes,
        });
      } else {
        // Fallback em ambientes/navegadores onde performance.memory não é padronizado (Safari / Firefox)
        setMemory({
          usedMB: 65,
          totalMB: 120,
          limitMB: 2048,
          percentUsed: 3,
          isSupported: false,
          usedJSHeapSize: 65 * 1024 * 1024,
        });
      }
    } catch (e) {
      console.warn('[useMemoryMonitor] Falha ao coletar métricas de heap:', e);
    }
  }, []);

  const clearMemoryAndCache = useCallback(() => {
    try {
      // 1. Limpeza de caches temporários do sessionStorage
      try {
        const keysToRemoveSession = [
          'temp_stream_cache',
          'temp_video_buffers',
          'maxtv_temp_epg_cache',
          'maxtv_transient_logs',
          'hls_buffer_cache',
        ];
        keysToRemoveSession.forEach(key => sessionStorage.removeItem(key));
      } catch (err) {
        console.warn('[useMemoryMonitor] Falha ao limpar sessionStorage:', err);
      }

      // 2. Limpeza seletiva de chaves transitórias no localStorage (mantendo dados essenciais do usuário)
      try {
        const keysToRemoveLocal = [
          'maxtv_temp_stream_cache',
          'maxtv_cached_epg_preview',
          'maxtv_debug_metrics',
        ];
        keysToRemoveLocal.forEach(key => localStorage.removeItem(key));
      } catch (err) {
        console.warn('[useMemoryMonitor] Falha ao limpar localStorage temporário:', err);
      }

      // 3. Disparo de evento de broadcast para componentes ativos e instâncias em background desalocarem recursos
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('maxtv:clear-inactive-instances', {
            detail: {
              reason: 'memory_threshold_exceeded',
              thresholdMB,
              timestamp: Date.now(),
            },
          })
        );
      }

      // 4. Invocação de Garbage Collector caso exposto no runtime (Chromium / Electron flags)
      if (typeof window !== 'undefined' && typeof (window as any).gc === 'function') {
        try {
          (window as any).gc();
        } catch {}
      }

      setLastCleanedAt(new Date().toLocaleTimeString('pt-BR'));
      setTimeout(checkMemory, 350);
    } catch (e) {
      console.warn('[useMemoryMonitor] Erro na limpeza preventiva de memória:', e);
    }
  }, [checkMemory, thresholdMB]);

  useEffect(() => {
    checkMemory();
    const timer = setInterval(checkMemory, 4000);
    return () => clearInterval(timer);
  }, [checkMemory]);

  const isExceeded = memory.usedMB > thresholdMB;

  return {
    memory,
    isExceeded,
    thresholdMB,
    lastCleanedAt,
    clearMemoryAndCache,
    checkMemory,
  };
}
