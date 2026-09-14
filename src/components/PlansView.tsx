import React from 'react';
import { Check, Crown, Zap, ShieldCheck, Sparkles, HelpCircle } from 'lucide-react';
import { SUBSCRIPTION_PLANS } from '../data/plansData';
import { SubscriptionPlan } from '../types';

interface PlansViewProps {
  onSelectPlan: (plan: SubscriptionPlan) => void;
  isVip: boolean;
}

export const PlansView: React.FC<PlansViewProps> = ({ onSelectPlan, isVip }) => {
  return (
    <div className="w-full max-w-6xl mx-auto py-8 px-4 sm:px-6">
      {/* Hero Header */}
      <div className="text-center max-w-3xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs font-semibold mb-4 shadow-sm">
          <Crown className="w-4 h-4" />
          <span>Planos VIP Streaming Brasil • MAXTV</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-bold text-white tracking-tight mb-4">
          Assista ao Vivo e Sob Demanda Sem Limites
        </h1>
        <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
          Libere mais de 110 canais ao vivo, transmissões esportivas de futebol, cinema 4K e séries completas. Pagamento via Mercado Pago PIX com liberação instantânea.
        </p>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-16 items-stretch">
        {SUBSCRIPTION_PLANS.map(plan => {
          const isPopular = plan.isPopular;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between p-6 sm:p-8 rounded-3xl border transition-all ${
                isPopular
                  ? 'bg-slate-900 border-indigo-500/50 shadow-2xl shadow-indigo-950/40 ring-1 ring-indigo-500/30 scale-105 z-10'
                  : 'bg-slate-900 border-white/5 hover:border-white/15'
              }`}
            >
              {isPopular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-indigo-600 text-white font-semibold text-xs tracking-wide px-4 py-1 rounded-full shadow-lg shadow-indigo-600/30">
                  Mais Escolhido
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  {plan.badge && !isPopular && (
                    <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-white/10">
                      {plan.badge}
                    </span>
                  )}
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm text-slate-400">R$</span>
                    <span className="text-4xl sm:text-5xl font-bold text-white">
                      {plan.price.toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-xs text-slate-400">/ {plan.period}</span>
                  </div>
                  <span className="text-xs text-indigo-400 font-semibold mt-1 block">
                    Acesso integral por {plan.durationDays} dias via PIX
                  </span>
                </div>

                <div className="space-y-3 pb-8 border-b border-white/10 text-xs text-slate-300">
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="p-0.5 rounded-full bg-indigo-600/20 text-indigo-400 shrink-0 mt-0.5">
                        <Check className="w-3 h-3" />
                      </div>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6">
                <button
                  type="button"
                  onClick={() => onSelectPlan(plan)}
                  className={`w-full py-3.5 rounded-full font-semibold text-sm flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all ${
                    isPopular
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25'
                      : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                  }`}
                >
                  <Zap className="w-4 h-4 fill-current" />
                  <span>Assinar com Mercado Pago PIX</span>
                </button>
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 mt-3">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Liberação automática em menos de 10 segundos</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* FAQs */}
      <div className="max-w-3xl mx-auto rounded-3xl bg-slate-900 border border-white/5 p-6 sm:p-8">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-indigo-400" />
          <span>Dúvidas Frequentes sobre a Assinatura</span>
        </h3>

        <div className="space-y-3 text-xs sm:text-sm">
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5">
            <h4 className="font-semibold text-white mb-1">Como funciona a ativação com o Mercado Pago PIX?</h4>
            <p className="text-slate-400 leading-relaxed">
              Após clicar no plano desejado, um QR Code oficial do Pix e o código Copia e Cola são gerados instantaneamente. Assim que o banco confirma o pagamento, o sistema valida a transação e libera seu acesso VIP na hora.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5">
            <h4 className="font-semibold text-white mb-1">Quais canais estão inclusos na MAXTV?</h4>
            <p className="text-slate-400 leading-relaxed">
              O catálogo inclui os canais ao vivo cadastrados na grade (abertos, notícias, infantis, documentários e os principais canais esportivos de futebol brasileiro e internacional), além de filmes e séries em alta definição.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5">
            <h4 className="font-semibold text-white mb-1">Preciso assinar fidelidade?</h4>
            <p className="text-slate-400 leading-relaxed">
              Não. Não há fidelidade ou renovação oculta. Você escolhe o período (30, 90 ou 365 dias) e só renova se quiser continuar assistindo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
