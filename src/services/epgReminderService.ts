import { EpgReminder, EpgProgram, Channel } from '../types';

const REMINDERS_KEY = 'maxtv_epg_reminders';
export const EPG_REMINDER_TRIGGERED_EVENT = 'maxtv_epg_reminder_triggered';

class EpgReminderService {
  private checkInterval: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.startChecker();
    }
  }

  // Obter todos os lembretes do usuário
  getReminders(userEmail?: string): EpgReminder[] {
    try {
      const raw = localStorage.getItem(REMINDERS_KEY);
      if (!raw) return [];
      const all: EpgReminder[] = JSON.parse(raw);
      if (!userEmail) return all;
      return all.filter(r => r.userEmail.toLowerCase() === userEmail.toLowerCase());
    } catch {
      return [];
    }
  }

  // Verifica se o programa já tem lembrete agendado
  hasReminder(programId: string, userEmail?: string): boolean {
    const list = this.getReminders(userEmail);
    return list.some(r => r.programId === programId);
  }

  // Obter lembrete específico
  getReminder(programId: string, userEmail?: string): EpgReminder | undefined {
    const list = this.getReminders(userEmail);
    return list.find(r => r.programId === programId);
  }

  // Solicitar permissão nativa de notificações no navegador
  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'denied';
    }
    if (Notification.permission === 'granted') {
      return 'granted';
    }
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch (e) {
      console.warn('Erro ao solicitar permissão de notificações:', e);
      return 'denied';
    }
  }

  // Verifica se a permissão já foi concedida
  hasNotificationPermission(): boolean {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    return Notification.permission === 'granted';
  }

  // Agendar lembrete para um programa futuro
  addReminder(
    program: EpgProgram,
    channel: Channel,
    userEmail: string
  ): EpgReminder {
    const all = this.getReminders();

    // Evita duplicatas
    const existingIndex = all.findIndex(
      r => r.programId === program.id && r.userEmail.toLowerCase() === userEmail.toLowerCase()
    );

    const newReminder: EpgReminder = {
      id: `rem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      programId: program.id,
      programTitle: program.title,
      channelId: channel.id,
      channelName: channel.name,
      channelLogo: channel.logo,
      startTime: program.start,
      formattedTime: program.startFormatted,
      durationMinutes: program.durationMinutes,
      userEmail: userEmail.toLowerCase(),
      createdAt: new Date().toISOString(),
      notified: false
    };

    if (existingIndex >= 0) {
      all[existingIndex] = newReminder;
    } else {
      all.push(newReminder);
    }

    try {
      localStorage.setItem(REMINDERS_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('Erro ao salvar lembrete no localStorage:', e);
    }

    return newReminder;
  }

  // Cancelar lembrete
  removeReminder(programId: string, userEmail?: string): void {
    const all = this.getReminders();
    const filtered = all.filter(r => {
      if (userEmail) {
        return !(r.programId === programId && r.userEmail.toLowerCase() === userEmail.toLowerCase());
      }
      return r.programId !== programId;
    });
    try {
      localStorage.setItem(REMINDERS_KEY, JSON.stringify(filtered));
    } catch {}
  }

  // Alterna o agendamento de lembrete
  toggleReminder(
    program: EpgProgram,
    channel: Channel,
    userEmail: string
  ): { scheduled: boolean; reminder?: EpgReminder } {
    if (this.hasReminder(program.id, userEmail)) {
      this.removeReminder(program.id, userEmail);
      return { scheduled: false };
    } else {
      const reminder = this.addReminder(program, channel, userEmail);
      return { scheduled: true, reminder };
    }
  }

  // Dispara a notificação nativa do navegador
  private sendNativeNotification(reminder: EpgReminder) {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const title = `Começou agora: ${reminder.programTitle}`;
      const options: NotificationOptions = {
        body: `O programa está no ar no canal ${reminder.channelName}. Clique para abrir o reprodutor ao vivo!`,
        icon: reminder.channelLogo || '/icon.png',
        badge: '/icon.png',
        tag: `epg_reminder_${reminder.id}`,
        requireInteraction: true
      };

      const notification = new Notification(title, options);
      notification.onclick = () => {
        window.focus();
        notification.close();
        window.dispatchEvent(
          new CustomEvent(EPG_REMINDER_TRIGGERED_EVENT, { detail: reminder })
        );
      };
    } catch (err) {
      console.warn('Erro ao disparar notificação nativa:', err);
    }
  }

  // Inicia o loop de verificação periódica de lembretes
  startChecker() {
    if (this.checkInterval) return;

    // Checa a cada 20 segundos
    this.checkInterval = setInterval(() => {
      this.checkDueReminders();
    }, 20000);

    // Executa verificação inicial logo após carregar
    setTimeout(() => this.checkDueReminders(), 2000);
  }

  // Verifica se há lembretes que atingiram o horário de início
  private checkDueReminders() {
    try {
      const all = this.getReminders();
      if (all.length === 0) return;

      const nowMs = Date.now();
      let updated = false;

      const nextList = all.map(r => {
        if (r.notified) return r;

        const startMs = new Date(r.startTime).getTime();
        // Dispara se o horário do programa chegou (com tolerância de até 15 minutos após o início)
        if (nowMs >= startMs && nowMs <= startMs + 15 * 60 * 1000) {
          // Dispara notificação nativa
          this.sendNativeNotification(r);
          // Dispara evento global in-app para toast/banner
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent(EPG_REMINDER_TRIGGERED_EVENT, { detail: r })
            );
          }
          updated = true;
          return { ...r, notified: true };
        }
        return r;
      });

      if (updated) {
        localStorage.setItem(REMINDERS_KEY, JSON.stringify(nextList));
      }
    } catch (e) {
      console.warn('Erro no ciclo de verificação de lembretes EPG:', e);
    }
  }

  stopChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}

export const epgReminderService = new EpgReminderService();
