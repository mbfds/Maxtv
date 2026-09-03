import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { 
  X, Check, Copy, CheckCircle2, ShieldCheck, Zap, 
  Crown, Clock, AlertCircle, ArrowRight, Sparkles 
} from 'lucide-react';
import { SubscriptionPlan, PixTransaction, Subscriber } from '../types';
import { SUBSCRIPTION_PLANS } from '../data/plansData';
import { api } from '../services/api';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubscriptionSuccess: (subscriber: Subscriber) => void;
  selectedPlanInitial?: SubscriptionPlan;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  onClose,
  onSubscriptionSuccess,
  selectedPlanInitial
}) => {
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(
    selectedPlanInitial || SUBSCRIPTION_PLANS[0]
  );
  const [step, setStep] = useState<'form' | 'pix' | 'success'>('form');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [cpf, setCpf] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [transaction, setTransaction] = useState<PixTransaction | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(1800); // 30 mins

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      if (selectedPlanInitial) setSelectedPlan(selectedPlanInitial);
      setStep('form');
      setErrorMessage('');
      setCopied(false);
    }
  }, [isOpen, selectedPlanInitial]);

  // Countdown timer for Pix
  useEffect(() => {
    if (step !== 'pix' || !transaction) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [step, transaction]);

  // Status Polling for Mercado Pago Pix
  useEffect(() => {
    if (step !== 'pix' || !transaction) return;

    const interval = setInterval(async () => {
      try {
        const res = await api.checkPixStatus(transaction.id);
        if (res.status === 'approved') {
          clearInterval(interval);
          triggerSuccess(res.transaction);
        }
      } catch (err) {
        // Silently continue polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [step, transaction]);

  const triggerSuccess = (tx: PixTransaction) => {
    setStep('success');
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {
      // safe fallback
    }

    const newSub: Subscriber = {
      id: `sub-${Date.now().toString().slice(-5)}`,
      name: tx.subscriberName,
      email: tx.subscriberEmail,
      cpf: tx.cpf,
      planId: tx.planId,
      planName: tx.planName,
      status: 'active',
      startDate: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (selectedPlan.durationDays || 30) * 86400000).toISOString(),
      amountPaid: tx.amount
    };

    onSubscriptionSuccess(newSub);
  };

  const handleGeneratePix = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) {
      setErrorMessage('Por favor, preencha nome e e-mail.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      const res = await api.createPixPayment({
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        price: selectedPlan.price,
        userName: name,
        userEmail: email,
        cpf: cpf || '123.456.789-00'
      });

      if (res.success && res.transaction) {
        setTransaction(res.transaction);
        setTimeLeft(1800);
        setStep('pix');
      } else {
        throw new Error('Falha ao processar pagamento.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao conectar ao Mercado Pago.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!transaction?.qrCodeText) return;
    navigator.clipboard.writeText(transaction.qrCodeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSimulatePayment = async () => {
    if (!transaction) return;
    setIsLoading(true);
    try {
      const res = await api.simulatePixPayment(transaction.id);
      if (res.success) {
        triggerSuccess(res.transaction);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha ao confirmar simulação');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-xl bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl my-auto animate-fadeIn">
        {/* Top Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/25">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">
                Assinatura MAXTV • Mercado Pago Pix
              </h3>
              <p className="text-xs text-slate-400">Ativação Imediata e Automática</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full bg-slate-800/80 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: FORM & PLAN SELECTION */}
        {step === 'form' && (
          <form onSubmit={handleGeneratePix} className="p-6 space-y-6">
            {/* Plan Selector Cards */}
            <div>
              <label className="block text-xs uppercase font-semibold text-slate-400 mb-2.5">
                1. Escolha seu Plano:
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {SUBSCRIPTION_PLANS.map(plan => (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`p-3 rounded-2xl border cursor-pointer text-center transition-all ${
                      selectedPlan.id === plan.id
                        ? 'bg-indigo-950/40 border-indigo-500 shadow-md shadow-indigo-600/20 scale-[1.02]'
                        : 'bg-slate-950/50 border-white/5 hover:border-white/15'
                    }`}
                  >
                    {plan.badge && (
                      <span className="inline-block text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 mb-1">
                        {plan.badge}
                      </span>
                    )}
                    <h4 className="text-xs font-bold text-white truncate">{plan.name}</h4>
                    <div className="text-sm sm:text-base font-bold text-indigo-400 mt-1">
                      R$ {plan.price.toFixed(2).replace('.', ',')}
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      {plan.durationDays} dias
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Payer Information */}
            <div className="space-y-3.5">
              <label className="block text-xs uppercase font-semibold text-slate-400">
                2. Seus Dados para Ativação:
              </label>

              <div>
                <input
                  type="text"
                  required
                  placeholder="Nome Completo"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-950/80 text-sm text-white placeholder-slate-500 rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <input
                  type="email"
                  required
                  placeholder="E-mail (onde receberá o acesso)"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-950/80 text-sm text-white placeholder-slate-500 rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <input
                  type="text"
                  placeholder="CPF (opcional para nota Pix)"
                  value={cpf}
                  onChange={e => setCpf(e.target.value)}
                  className="w-full bg-slate-950/80 text-sm text-white placeholder-slate-500 rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Security Notice */}
            <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 text-xs text-slate-400">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>Pagamento processado via Mercado Pago com criptografia de ponta a ponta e compensação em segundos.</span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm sm:text-base shadow-xl shadow-indigo-600/25 active:scale-98 transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <span>Gerando QR Code Pix...</span>
              ) : (
                <>
                  <span>Pagar R$ {selectedPlan.price.toFixed(2).replace('.', ',')} com Pix</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: PIX QR CODE & COPY/PASTE */}
        {step === 'pix' && transaction && (
          <div className="p-6 space-y-6 text-center">
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-indigo-300 bg-indigo-950/60 py-1.5 px-4 rounded-full border border-indigo-500/30 mx-auto w-fit">
              <Clock className="w-4 h-4 animate-spin" />
              <span>Aguardando pagamento • Expira em {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
            </div>

            {/* QR Code Frame */}
            <div className="inline-block p-4 rounded-2xl bg-white shadow-2xl border-2 border-indigo-500/30">
              {transaction.qrCodeBase64 ? (
                <img
                  src={transaction.qrCodeBase64}
                  alt="QR Code Pix"
                  className="w-52 h-52 object-contain"
                />
              ) : (
                <div className="w-52 h-52 flex items-center justify-center text-slate-950 font-mono text-xs">
                  Carregando QR Code...
                </div>
              )}
            </div>

            {/* Value and Order Info */}
            <div>
              <div className="text-2xl font-bold text-white">
                R$ {transaction.amount.toFixed(2).replace('.', ',')}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {transaction.planName} • Pedido #{transaction.orderId}
              </p>
            </div>

            {/* Pix Copia e Cola Code */}
            <div className="text-left space-y-1.5">
              <span className="text-xs font-semibold text-slate-400">Pix Copia e Cola:</span>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-950 border border-white/10">
                <input
                  type="text"
                  readOnly
                  value={transaction.qrCodeText}
                  className="w-full bg-transparent text-xs text-slate-300 font-mono truncate focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shrink-0 transition-colors shadow-sm"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Testing / Instant Simulation Button */}
            <div className="pt-2 border-t border-white/10">
              <p className="text-[11px] text-slate-500 mb-2">
                Para testar e aprovar instantaneamente sem aguardar o app do banco:
              </p>
              <button
                type="button"
                onClick={handleSimulatePayment}
                disabled={isLoading}
                className="w-full py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-indigo-500/30 text-indigo-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Simular Pagamento Instantâneo Pix (Aprovar Teste)</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SUCCESS CONFIRMATION */}
        {step === 'success' && (
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-indigo-600/20 border-2 border-indigo-500 flex items-center justify-center mx-auto text-indigo-400 shadow-lg shadow-indigo-600/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <span className="text-xs font-semibold tracking-wider uppercase text-indigo-400">
                Pagamento Pix Confirmado com Sucesso!
              </span>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mt-1">
                Você agora é Assinante MAXTV VIP!
              </h3>
              <p className="text-sm text-slate-300 max-w-md mx-auto mt-2">
                Todos os 110+ canais de TV ao vivo, esportes Premiere/SporTV e o catálogo completo de filmes e séries 4K foram liberados imediatamente na sua conta.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 text-left text-xs text-slate-300 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Plano Ativado:</span>
                <span className="font-semibold text-white">{selectedPlan.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duração:</span>
                <span className="font-semibold text-white">{selectedPlan.durationDays} dias</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Valor Pago:</span>
                <span className="font-bold text-indigo-400">R$ {selectedPlan.price.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-3.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm sm:text-base shadow-xl shadow-indigo-600/30 active:scale-95 transition-all"
            >
              Começar a Assistir Agora
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
