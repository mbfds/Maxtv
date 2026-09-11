import React, { useState, useEffect, useRef } from 'react';
import { Shield, Lock, KeyRound, AlertCircle, ArrowLeft, CheckCircle2, UserCheck, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { User } from '../types';
import { api } from '../services/api';
import { adminAuthManager } from '../services/adminAuthManager';

interface AdminAuthGateProps {
  onAdminSuccess: (user: User, token?: string) => void;
  onCancel: () => void;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({
  onAdminSuccess,
  onCancel
}) => {
  // Check instant synchronous cache - if already verified or no token exists, don't show loading spinner
  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(() => {
    const instant = adminAuthManager.getInstantSession();
    if (instant?.isAuthenticated) return false;
    // Only verify if we actually have a stored admin token to test
    const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('maxtv_admin_token') : null;
    return Boolean(token);
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'pin' | 'credentials'>('pin');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('cebolao1302@gmail.com');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const onAdminSuccessRef = useRef(onAdminSuccess);
  useEffect(() => {
    onAdminSuccessRef.current = onAdminSuccess;
  });

  const hasExecutedRef = useRef(false);

  // Single-promise asynchronous session verification on mount
  useEffect(() => {
    if (hasExecutedRef.current) return;
    hasExecutedRef.current = true;

    // 1. Instant check
    const instant = adminAuthManager.getInstantSession();
    if (instant?.isAuthenticated && instant.user) {
      setIsVerifyingSession(false);
      onAdminSuccessRef.current(instant.user, instant.token);
      return;
    }

    // 2. Asynchronous verification through single promise
    let isMounted = true;
    adminAuthManager.verifySession()
      .then((res) => {
        if (!isMounted) return;
        setIsVerifyingSession(false);

        if (res.isAuthenticated && res.user) {
          onAdminSuccessRef.current(res.user, res.token);
        } else if (res.isExpired) {
          setSessionNotice(res.error || 'Sessão administrativa anterior expirada. Insira o PIN Master.');
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setIsVerifyingSession(false);
        setSessionNotice('Insira o PIN Master para acessar a área administrativa.');
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSessionNotice(null);
    try {
      const res = await api.adminVerify({ pin: pin.trim() });
      if (res.success && res.user) {
        if (res.user.role !== 'admin') {
          throw new Error('Acesso negado: Usuário autenticado não possui privilégios de administrador.');
        }

        adminAuthManager.setSessionSuccess(res.user, res.token);
        setIsSubmitting(false);
        onAdminSuccessRef.current(res.user, res.token);
      } else {
        setErrorMsg(res.message || 'PIN de administrador inválido.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'PIN incorreto. Tente novamente.');
      setIsSubmitting(false);
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSessionNotice(null);
    try {
      const res = await api.adminVerify({ email: email.trim(), password: password.trim() });
      if (res.success && res.user) {
        if (res.user.role !== 'admin') {
          throw new Error('Acesso negado: Credenciais válidas, mas o usuário não possui privilégios de administrador.');
        }

        adminAuthManager.setSessionSuccess(res.user, res.token);
        setIsSubmitting(false);
        onAdminSuccessRef.current(res.user, res.token);
      } else {
        setErrorMsg(res.message || 'Credenciais de administrador inválidas.');
        setIsSubmitting(false);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha ao autenticar administrador.');
      setIsSubmitting(false);
    }
  };

  // State: One-time verifying existing session on initial load
  if (isVerifyingSession) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-md bg-slate-900 border border-indigo-500/30 rounded-3xl p-8 shadow-2xl shadow-indigo-950/50 text-center space-y-5 relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />
          
          <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 mx-auto shadow-inner">
            <Shield className="w-8 h-8 animate-pulse" />
            <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center text-white border-2 border-slate-900">
              <RefreshCw className="w-3 h-3 animate-spin" />
            </span>
          </div>

          <div>
            <h2 className="text-lg font-black text-white tracking-tight mb-1">
              Verificando Sessão Administrativa
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
              Validando integridade do token de administrador com o servidor...
            </p>
          </div>

          <div className="pt-2">
            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-slate-800">
              <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-10 px-4">
      <div className="w-full max-w-md bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/50 relative overflow-hidden">
        {/* Subtle accent glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

        {/* Top Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 mb-2 shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">
            Área Administrativa Protegida
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
            O Painel de Controle e Gestão é restrito exclusivamente a contas com privilégios de administrador (<span className="text-indigo-300 font-mono font-semibold">role: 'admin'</span>).
          </p>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950/60 border border-indigo-500/30 text-[10px] text-indigo-300 font-medium">
            <Shield className="w-3 h-3 text-indigo-400" />
            <span>Validação de Segurança Ativa</span>
          </div>
        </div>

        {/* Session Expired / Notice */}
        {sessionNotice && !errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{sessionNotice}</span>
          </div>
        )}

        {/* Mode Selector */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => { setAuthMode('pin'); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              authMode === 'pin'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Acesso Master (PIN)</span>
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('credentials'); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              authMode === 'credentials'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Login de Admin</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form: PIN Master */}
        {authMode === 'pin' && (
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Digite o PIN Master de Administrador
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Ex: 1302 ou 2026"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-lg tracking-widest text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>

              {/* Quick-fill PIN Chips for Convenience */}
              <div className="flex items-center justify-center gap-2 pt-2.5">
                <span className="text-[11px] text-slate-400 font-medium">PINs rápidos:</span>
                {['1302', '2026', 'admin123'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { setPin(preset); setErrorMsg(''); }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      pin === preset
                        ? 'bg-indigo-600 text-white border border-indigo-400 shadow-sm'
                        : 'bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-white/5'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !pin.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Autenticando Acesso...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Validar e Entrar no Painel</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Form: Email & Password */}
        {authMode === 'credentials' && (
          <form onSubmit={handleCredentialsSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                E-mail do Administrador
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cebolao1302@gmail.com"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Senha ou PIN do Administrador
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2 pt-1.5">
                <span className="text-[10px] text-slate-400">Preenchimento rápido:</span>
                {['1302', 'admin123'].map((passPreset) => (
                  <button
                    key={passPreset}
                    type="button"
                    onClick={() => { setPassword(passPreset); setErrorMsg(''); }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-indigo-300 text-[10px] font-mono cursor-pointer"
                  >
                    {passPreset}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !password.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 mt-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verificando Administrador...</span>
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  <span>Entrar como Administrador</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer cancel button */}
        <div className="pt-5 mt-5 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar para a Programação Ao Vivo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
