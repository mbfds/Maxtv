import React, { useState } from 'react';
import { Shield, Lock, KeyRound, AlertCircle, ArrowLeft, CheckCircle2, UserCheck } from 'lucide-react';
import { User } from '../types';
import { api } from '../services/api';

interface AdminAuthGateProps {
  onAdminSuccess: (user: User) => void;
  onCancel: () => void;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({ onAdminSuccess, onCancel }) => {
  const [authMode, setAuthMode] = useState<'pin' | 'credentials'>('pin');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('cebolao1302@gmail.com');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;

    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await api.adminVerify({ pin: pin.trim() });
      if (res.success && res.user) {
        onAdminSuccess(res.user);
      } else {
        setErrorMsg(res.message || 'PIN de administrador inválido.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'PIN incorreto. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await api.adminVerify({ email: email.trim(), password: password.trim() });
      if (res.success && res.user) {
        onAdminSuccess(res.user);
      } else {
        setErrorMsg(res.message || 'Credenciais de administrador inválidas.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'E-mail ou senha de administrador incorretos.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-10 px-4">
      <div className="w-full max-w-md bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/50 relative overflow-hidden">
        {/* Subtle accent glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

        {/* Top Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 mb-2 shadow-inner">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">
            Área Administrativa Protegida
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
            O Painel de Controle e Gestão de Canais/Assinantes é restrito exclusivamente a administradores autorizados.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 mb-5">
          <button
            type="button"
            onClick={() => { setAuthMode('pin'); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              authMode === 'pin'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Acesso Rápido (PIN)</span>
          </button>
          <button
            type="button"
            onClick={() => { setAuthMode('credentials'); setErrorMsg(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
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
          <div className="p-3 mb-4 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form: PIN Master */}
        {authMode === 'pin' && (
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Digite o PIN Master ou Senha de Administrador
              </label>
              <div className="relative">
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="Ex: 1302 ou admin123"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-center text-lg tracking-widest text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5 text-center">
                PINs autorizados: <code className="text-indigo-300 font-mono">1302</code> ou <code className="text-indigo-300 font-mono">admin123</code>
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || !pin.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Autenticando Acesso...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Desbloquear Painel Admin</span>
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
                placeholder="admin@maxtv.vip"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Senha de Administrador
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !password.trim()}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 mt-2"
            >
              {isLoading ? (
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
