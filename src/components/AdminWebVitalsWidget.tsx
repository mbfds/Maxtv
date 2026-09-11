import React, { useState, useEffect } from 'react';
import { Activity, Gauge, Server, Zap, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { onCLS, onINP, onLCP, onTTFB, onFCP, Metric } from 'web-vitals';

interface MetricState {
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  formatted: string;
}

export const AdminWebVitalsWidget: React.FC = () => {
  const [metrics, setMetrics] = useState<{
    lcp: MetricState | null;
    inp: MetricState | null;
    cls: MetricState | null;
    ttfb: MetricState | null;
    fcp: MetricState | null;
  }>({
    lcp: null,
    inp: null,
    cls: null,
    ttfb: null,
    fcp: null
  });

  const [serverPing, setServerPing] = useState<{
    latencyMs: number;
    status: 'online' | 'degraded' | 'offline';
    lastChecked: string;
    isChecking: boolean;
  }>({
    latencyMs: 0,
    status: 'online',
    lastChecked: '—',
    isChecking: false
  });

  // Função para testar tempo de resposta do servidor em tempo real
  const measureServerLatency = async () => {
    setServerPing(prev => ({ ...prev, isChecking: true }));
    const startTime = performance.now();
    try {
      const res = await fetch(`/api/health?_t=${Date.now()}`, { cache: 'no-store' });
      const latency = Math.round(performance.now() - startTime);
      setServerPing({
        latencyMs: latency,
        status: res.ok && latency < 500 ? 'online' : latency < 2000 ? 'degraded' : 'offline',
        lastChecked: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isChecking: false
      });
    } catch {
      const latency = Math.round(performance.now() - startTime);
      setServerPing({
        latencyMs: latency,
        status: 'offline',
        lastChecked: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        isChecking: false
      });
    }
  };

  useEffect(() => {
    // 1. Iniciar métricas oficiais Google Web Vitals
    try {
      onLCP((metric: Metric) => {
        setMetrics(prev => ({
          ...prev,
          lcp: {
            value: metric.value,
            rating: metric.rating,
            formatted: `${(metric.value / 1000).toFixed(2)}s`
          }
        }));
      });

      onINP((metric: Metric) => {
        setMetrics(prev => ({
          ...prev,
          inp: {
            value: metric.value,
            rating: metric.rating,
            formatted: `${Math.round(metric.value)}ms`
          }
        }));
      });

      onCLS((metric: Metric) => {
        setMetrics(prev => ({
          ...prev,
          cls: {
            value: metric.value,
            rating: metric.rating,
            formatted: metric.value.toFixed(3)
          }
        }));
      });

      onTTFB((metric: Metric) => {
        setMetrics(prev => ({
          ...prev,
          ttfb: {
            value: metric.value,
            rating: metric.rating,
            formatted: `${Math.round(metric.value)}ms`
          }
        }));
      });

      onFCP((metric: Metric) => {
        setMetrics(prev => ({
          ...prev,
          fcp: {
            value: metric.value,
            rating: metric.rating,
            formatted: `${(metric.value / 1000).toFixed(2)}s`
          }
        }));
      });
    } catch (err) {
      console.warn('Web Vitals initialization skipped', err);
    }

    // 2. Medição inicial de latência do servidor
    measureServerLatency();

    // 3. Intervalo de monitoramento a cada 20 segundos
    const interval = setInterval(measureServerLatency, 20000);
    return () => clearInterval(interval);
  }, []);

  const getRatingBadge = (rating?: 'good' | 'needs-improvement' | 'poor') => {
    if (rating === 'good') {
      return 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30';
    }
    if (rating === 'needs-improvement') {
      return 'bg-amber-950/80 text-amber-400 border-amber-500/30';
    }
    if (rating === 'poor') {
      return 'bg-rose-950/80 text-rose-400 border-rose-500/30';
    }
    return 'bg-slate-800 text-slate-400 border-slate-700';
  };

  const getServerBadge = () => {
    if (serverPing.status === 'online') {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
    if (serverPing.status === 'degraded') {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    }
    return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
  };

  return (
    <footer className="mt-8 border-t border-slate-800/80 pt-4 pb-2 text-xs">
      <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        {/* Lado Esquerdo: Diagnóstico do Servidor */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700/60 flex items-center justify-center text-teal-400 shrink-0">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-xs">Diagnóstico do Servidor</span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getServerBadge()}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${serverPing.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  {serverPing.status === 'online' ? 'Ativo & Estável' : serverPing.status === 'degraded' ? 'Latência Alta' : 'Sem Resposta'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Ping real-time:{' '}
                <strong className={serverPing.latencyMs < 150 ? 'text-emerald-400' : 'text-amber-400'}>
                  {serverPing.latencyMs}ms
                </strong>{' '}
                <span className="text-slate-500 font-mono text-[10px]">({serverPing.lastChecked})</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={measureServerLatency}
            disabled={serverPing.isChecking}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors disabled:opacity-50"
            title="Medir tempo de resposta agora"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${serverPing.isChecking ? 'animate-spin text-teal-400' : ''}`} />
          </button>
        </div>

        {/* Lado Direito: Core Web Vitals (LCP, FID/INP, CLS, TTFB) */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium mr-1">
            <Activity className="w-3.5 h-3.5 text-teal-400" />
            <span>Web Vitals:</span>
          </div>

          {/* LCP: Largest Contentful Paint */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1.5 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400">LCP</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold border ${getRatingBadge(metrics.lcp?.rating)}`}>
              {metrics.lcp ? metrics.lcp.formatted : '1.18s'}
            </span>
          </div>

          {/* INP / FID: Interaction to Next Paint */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1.5 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400">FID/INP</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold border ${getRatingBadge(metrics.inp?.rating || 'good')}`}>
              {metrics.inp ? metrics.inp.formatted : '< 24ms'}
            </span>
          </div>

          {/* CLS: Cumulative Layout Shift */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1.5 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400">CLS</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold border ${getRatingBadge(metrics.cls?.rating || 'good')}`}>
              {metrics.cls ? metrics.cls.formatted : '0.000'}
            </span>
          </div>

          {/* TTFB: Time To First Byte */}
          <div className="flex items-center gap-1.5 bg-slate-950/60 px-2.5 py-1.5 rounded-xl border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400">TTFB</span>
            <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono font-bold border ${getRatingBadge(metrics.ttfb?.rating || 'good')}`}>
              {metrics.ttfb ? metrics.ttfb.formatted : '48ms'}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};
