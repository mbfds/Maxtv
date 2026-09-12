import React from 'react';
import { Cpu, AlertTriangle, CheckCircle2, Trash2, Sparkles } from 'lucide-react';
import { useMemoryDiagnostic } from '../hooks/useMemoryDiagnostic';

export const AdminMemoryFooter: React.FC = () => {
  const { memory, isExceeded, thresholdMB, lastCleanedAt, clearMemoryAndCache } = useMemoryDiagnostic(300);

  return (
    <footer id="admin-memory-diagnostic-footer" className="mt-8 pt-4 border-t border-slate-800/80">
      {/* Alerta Destacado caso a memória ultrapasse 300MB */}
      {isExceeded && (
        <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/5 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold flex items-center gap-2">
                <span>Alerta de Consumo de Memória ({memory.usedMB} MB)</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-200">
                  Acima de {thresholdMB} MB
                </span>
              </div>
              <p className="text-[11px] text-amber-200/80 mt-0.5">
                A aplicação atingiu alto volume de buffers de vídeo ou nós DOM em cache. Sugere-se limpar instâncias inativas para manter a navegação suave.
              </p>
            </div>
          </div>

          <button
            type="button"
            id="btn-clean-inactive-memory"
            onClick={clearMemoryAndCache}
            className="self-start sm:self-auto px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold shadow-md shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Limpar Instâncias Inativas</span>
          </button>
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
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" title="Atenção: Consumo elevado" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-emerald-400" title="Consumo dentro da margem segura" />
            )}
          </div>

          {/* Botão de limpeza preventiva */}
          <button
            type="button"
            onClick={clearMemoryAndCache}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 border border-transparent hover:border-slate-700 transition"
            title="Limpar referências inativas e liberar memória de buffers"
          >
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Otimizar RAM</span>
          </button>

          {lastCleanedAt && (
            <span className="text-[10px] text-slate-500">
              Última limpeza: {lastCleanedAt}
            </span>
          )}
        </div>

        <div className="text-[11px] text-slate-500">
          MAXTV Admin Engine &bull; Monitoramento de Desempenho &bull; v2.0
        </div>
      </div>
    </footer>
  );
};
