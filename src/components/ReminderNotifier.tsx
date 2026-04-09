'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CalendarClock, X } from 'lucide-react';
import styles from './ReminderNotifier.module.css';

type ReminderNotification = {
  id: string;
  title: string;
  detail: string;
  venue: string;
  event_time: string;
  reminder_at: string;
  client_name: string;
  lawyer_name: string;
  thread_id: string | null;
};

const POLL_MS = 12000;
const DISMISS_MS = 12000;
const REMINDER_CACHE_KEY = 'shieldher_due_reminders_cache';
const REMINDER_EVENT = 'shieldher:due-reminders';

function updateReminderCache(fresh: ReminderNotification[]) {
  if (typeof window === 'undefined' || fresh.length === 0) return;

  try {
    const cachedRaw = window.localStorage.getItem(REMINDER_CACHE_KEY);
    const cached = cachedRaw ? (JSON.parse(cachedRaw) as ReminderNotification[]) : [];
    const dedupe = new Map<string, ReminderNotification>();

    for (const item of [...fresh, ...(Array.isArray(cached) ? cached : [])]) {
      if (!item?.id) continue;
      dedupe.set(item.id, item);
    }

    window.localStorage.setItem(
      REMINDER_CACHE_KEY,
      JSON.stringify(Array.from(dedupe.values()).slice(0, 12))
    );
  } catch {
    // Ignore localStorage/cache failures.
  }
}

function formatDateTime(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function playReminderSound() {
  if (typeof window === 'undefined') return;
  const AudioContextClass =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const audioContext = new AudioContextClass();
    const now = audioContext.currentTime;
    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    const toneA = audioContext.createOscillator();
    toneA.type = 'sine';
    toneA.frequency.setValueAtTime(880, now);
    toneA.frequency.exponentialRampToValueAtTime(660, now + 0.2);
    toneA.connect(gainNode);
    toneA.start(now);
    toneA.stop(now + 0.22);

    const toneB = audioContext.createOscillator();
    toneB.type = 'triangle';
    toneB.frequency.setValueAtTime(784, now + 0.24);
    toneB.frequency.exponentialRampToValueAtTime(523, now + 0.5);
    toneB.connect(gainNode);
    toneB.start(now + 0.24);
    toneB.stop(now + 0.55);

    window.setTimeout(() => {
      void audioContext.close();
    }, 700);
  } catch {
    // Silent fallback if autoplay/audio context is blocked.
  }
}

export default function ReminderNotifier() {
  const [toasts, setToasts] = useState<ReminderNotification[]>([]);
  const seenRef = useRef(new Set<string>());
  const timeoutRef = useRef(new Map<string, number>());

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const activeTimer = timeoutRef.current.get(id);
    if (activeTimer) {
      window.clearTimeout(activeTimer);
      timeoutRef.current.delete(id);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (window.Notification.permission !== 'default') return;

    const requestPermission = () => {
      void window.Notification.requestPermission().catch(() => {
        // Ignore browser permission failures.
      });
    };

    window.addEventListener('pointerdown', requestPermission, { once: true });
    window.addEventListener('keydown', requestPermission, { once: true });

    return () => {
      window.removeEventListener('pointerdown', requestPermission);
      window.removeEventListener('keydown', requestPermission);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const timeoutMap = timeoutRef.current;

    async function pollReminders() {
      try {
        const response = await fetch('/api/reminders/due', { cache: 'no-store' });
        if (!response.ok) return;

        const payload: unknown = await response.json();
        const notifications = Array.isArray(
          (payload as { notifications?: unknown }).notifications
        )
          ? ((payload as { notifications: ReminderNotification[] }).notifications ?? [])
          : [];

        const fresh = notifications.filter((item) => {
          if (!item?.id) return false;
          if (seenRef.current.has(item.id)) return false;
          seenRef.current.add(item.id);
          return true;
        });

        if (!active || fresh.length === 0) return;

        updateReminderCache(fresh);
        window.dispatchEvent(new CustomEvent<ReminderNotification[]>(REMINDER_EVENT, { detail: fresh }));

        setToasts((current) => [...fresh, ...current].slice(0, 5));
        playReminderSound();

        if (typeof window !== 'undefined' && 'Notification' in window) {
          const shouldNotify = window.Notification.permission === 'granted';
          if (shouldNotify) {
            for (const item of fresh) {
              const bodyParts = [
                `Client: ${item.client_name || 'ShieldHer User'}`,
                formatDateTime(item.event_time),
              ].filter(Boolean);
              void new window.Notification(`Hearing Reminder: ${item.title}`, {
                body: bodyParts.join(' | '),
              });
            }
          }
        }

        for (const item of fresh) {
          const timer = window.setTimeout(() => {
            dismissToast(item.id);
          }, DISMISS_MS);
          timeoutMap.set(item.id, timer);
        }
      } catch {
        // Ignore transient fetch errors; polling will retry.
      }
    }

    void pollReminders();
    const timer = window.setInterval(() => {
      void pollReminders();
    }, POLL_MS);

    return () => {
      active = false;
      window.clearInterval(timer);
      for (const timeoutId of timeoutMap.values()) {
        window.clearTimeout(timeoutId);
      }
      timeoutMap.clear();
    };
  }, [dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div className={styles.toastStack} role="status" aria-live="polite">
      {toasts.map((toast) => (
        <article key={toast.id} className={styles.toastCard}>
          <div className={styles.toastHead}>
            <span className={styles.toastBadge}>
              <BellRing size={13} />
              Reminder
            </span>
            <button
              type="button"
              className={styles.toastDismiss}
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss reminder notification"
            >
              <X size={13} />
            </button>
          </div>
          <p className={styles.toastTitle}>{toast.title}</p>
          <p className={styles.toastMeta}>
            <CalendarClock size={13} />
            {formatDateTime(toast.event_time)}
          </p>
          {toast.client_name ? <p className={styles.toastSub}>Client: {toast.client_name}</p> : null}
          {toast.venue ? <p className={styles.toastSub}>{toast.venue}</p> : null}
          {toast.detail ? <p className={styles.toastDetail}>{toast.detail}</p> : null}
        </article>
      ))}
    </div>
  );
}
