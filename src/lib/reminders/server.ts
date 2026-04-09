import { asObject, toText } from '@/lib/communication/server';

export type ReminderEventRow = {
  id: string;
  lawyer_id: string;
  user_id: string;
  thread_id: string | null;
  title: string;
  detail: string;
  venue: string;
  event_time: string;
  reminder_at: string;
  client_name: string;
  lawyer_name: string;
  created_at: string;
};

type DbErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

export function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function toIso(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

export function getSelectedLawyerId(metadata: Record<string, unknown>): string {
  const directId = toText(metadata.selected_lawyer_id);
  if (directId) return directId;
  const selectedLawyer = asObject(metadata.selected_lawyer);
  return toText(selectedLawyer.id);
}

export function getSelectedLawyerName(metadata: Record<string, unknown>): string {
  const directName = toText(metadata.selected_lawyer_name);
  if (directName) return directName;
  const selectedLawyer = asObject(metadata.selected_lawyer);
  return toText(selectedLawyer.name);
}

export function isMissingReminderTableError(error: unknown): boolean {
  const dbError = (error ?? {}) as DbErrorLike;
  const code = typeof dbError.code === 'string' ? dbError.code.toUpperCase() : '';
  const message = typeof dbError.message === 'string' ? dbError.message.toLowerCase() : '';
  const details = typeof dbError.details === 'string' ? dbError.details.toLowerCase() : '';
  const hint = typeof dbError.hint === 'string' ? dbError.hint.toLowerCase() : '';
  const combined = `${message} ${details} ${hint}`;

  if (code === '42P01' || code === '42703') return true;
  if (code === 'PGRST204' || code === 'PGRST205') return true;
  if (!combined.includes('hearing_reminders')) return false;
  if (combined.includes('does not exist')) return true;
  if (combined.includes('schema cache')) return true;
  if (combined.includes('could not find the table')) return true;
  if (combined.includes('could not find the') && combined.includes('column')) return true;
  return false;
}

export function getReminderSchemaSetupMessage(): string {
  return 'Reminder storage is not configured yet. Please run the latest SQL schema update and retry.';
}

export function getErrorMessage(error: unknown): string {
  const dbError = (error ?? {}) as DbErrorLike;
  const message = typeof dbError.message === 'string' ? dbError.message.trim() : '';
  if (message) return message;
  return '';
}
