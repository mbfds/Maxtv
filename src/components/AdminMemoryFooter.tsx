import React, { useState } from 'react';
import { Cpu, AlertTriangle, CheckCircle2, Trash2, Sparkles, X } from 'lucide-react';
import { useMemoryMonitor } from '../hooks/useMemoryMonitor';

export const AdminMemoryFooter: React.FC = () => {
  const { memory, isExceeded, thresholdMB, lastCleanedAt, clearMemoryAndCache } = useMemoryMonitor(400);
  const [isAlertDismissed, setIsAlertDismissed] = useState<boolean>(false);

  return (
    <footer id="admin-memory-diagnostic-footer" className="mt-8 pt-4 border-t border-slate-800/80">
      {/* Alerta Discreto caso a memória ultrapasse 400MB */}
      {isExceeded && !isAlertDismissed && (
        <div 
          id="admin-memory-warning-alert"
          className="mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/5 transition-all animate-in fade-in"
        >
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold flex items-center gap-2 flex-wrap">
                <span>Alerta de Memória JS ({memory.usedMB} MB)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-200">
                  Excedeu {thresholdMB} MB
                </span>
                {memory.percentUsed > 0 && (
                  <span className="text-[10px] text-amber-300/70">
                    ({memory.percentUsed}% do heap alocado)
                  </span>
                )}
              </div>
              <p className="text-[11px] text-amber-200/80 mt-0.5">
                Consumo elevado de JS Heap detectado via <code className="text-amber-100 bg-amber-950/40 px-1 py-0.5 rounded font-mono">performance.memory.usedJSHeapSize</code>. Sugere-se a liberação de instâncias de componentes inativos ou limpeza de cache local para assegurar estabilidade.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              id="btn-clean-inactive-memory"
              onClick={clearMemoryAndCache}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-semibold shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
              title="Liberar instâncias inativas e limpar caches temporários"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Liberar Instâncias & Cache</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAlertDismissed(true)}
              className="p-1.5 rounded-lg text-amber-400/70 hover:text-amber-200 hover:bg-amber-500/20 transition cursor-pointer"
              title="Fechar alerta discreto"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Barra de Rodapé com Diagnóstico de Memória e Sistema */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Indicador de Memória */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-400 text-[11px]">Memória JS:</span>
            <span className={`font-mono font-bold text-[11px] ${
              isExceeded ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {memory.usedMB} MB
            </span>
            <span className="text-[10px] text-slate-500">/ {thresholdMB} MB máx</span>

            {isExceeded ? (
              <span 
                className="w-2 h-2 rounded-full bg-amber-400 animate-ping cursor-pointer" 
                title="Atenção: Consumo acima de 400 MB. Clique em Otimizar RAM."
                onClick={() => setIsAlertDismissed(false)}
              />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" title="Consumo dentro da margem segura" />
            )}
          </div>

          {/* Botão de limpeza preventiva */}
          <button
            type="button"
            onClick={clearMemoryAndCache}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 border border-transparent hover:border-slate-700 transition cursor-pointer"
            title="Liberar instâncias inativas de vídeo e limpar caches transitórios"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Otimizar RAM & Cache</span>
          </button>

          {lastCleanedAt && (
            <span className="text-[10px] text-slate-500">
              Última limpeza: {lastCleanedAt}
            </span>
          )}
        </div>

        <div className="text-[11px] text-slate-500">
          MAXTV Admin Engine &bull; Monitoramento de Desempenho Heap &bull; v2.0
        </div>
      </div>
    </footer>
  );
};
