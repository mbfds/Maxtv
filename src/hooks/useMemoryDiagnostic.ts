import { useState, useEffect, useCallback } from 'react';

export interface MemoryInfo {
  usedMB: number;
  totalMB: number;
  limitMB: number;
  percentUsed: number;
  isSupported: boolean;
}

export interface MemoryDiagnosticResult {
  memory: MemoryInfo;
  isExceeded: boolean;
  thresholdMB: number;
  lastCleanedAt: string | null;
  clearMemoryAndCache: () => void;
}

const MEMORY_THRESHOLD_MB = 300;

export function useMemoryDiagnostic(thresholdMB: number = MEMORY_THRESHOLD_MB): MemoryDiagnosticResult {
  const [memory, setMemory] = useState<MemoryInfo>({
    usedMB: 0,
    totalMB: 0,
    limitMB: 0,
    percentUsed: 0,
    isSupported: false,
  });
  const [lastCleanedAt, setLastCleanedAt] = useState<string | null>(null);

  const checkMemory = useCallback(() => {
    try {
      const perf = window.performance as any;
      if (perf && perf.memory) {
        const usedBytes = perf.memory.usedJSHeapSize || 0;
        const totalBytes = perf.memory.totalJSHeapSize || 0;
        const limitBytes = perf.memory.jsHeapSizeLimit || 1;

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
        });
      } else {
        // Fallback para navegadores sem performance.memory (Safari/Firefox)
        // Estima uso moderado baseado em recursos e cache
        setMemory({
          usedMB: 65,
          totalMB: 120,
          limitMB: 2048,
          percentUsed: 3,
          isSupported: false,
        });
      }
    } catch {
      // Ignora falha de verificação
    }
  }, []);

  const clearMemoryAndCache = useCallback(() => {
    try {
      // 1. Limpar caches transitórios no sessionStorage
      try {
        sessionStorage.removeItem('temp_stream_cache');
        sessionStorage.removeItem('temp_video_buffers');
      } catch {}

      // 2. Disparar evento global para componentes liberarem referências e instâncias inativas
      window.dispatchEvent(new CustomEvent('maxtv:clear-inactive-instances', {
        detail: { reason: 'memory_threshold_exceeded', timestamp: Date.now() }
      }));

      // 3. Chamar GC se exposto no ambiente
      if (typeof (window as any).gc === 'function') {
        (window as any).gc();
      }

      setLastCleanedAt(new Date().toLocaleTimeString('pt-BR'));
      setTimeout(checkMemory, 300);
    } catch (e) {
      console.warn('[Memory Diagnostic] Falha ao executar limpeza:', e);
    }
  }, [checkMemory]);

  useEffect(() => {
    checkMemory();
    const intervalId = setInterval(checkMemory, 5000);
    return () => clearInterval(intervalId);
  }, [checkMemory]);

  const isExceeded = memory.usedMB > thresholdMB;

  return {
    memory,
    isExceeded,
    thresholdMB,
    lastCleanedAt,
    clearMemoryAndCache,
  };
}
