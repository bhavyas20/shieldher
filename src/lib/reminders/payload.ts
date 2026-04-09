const REMINDER_PREFIX = 'HEARING_REMINDER::';

export type ReminderMessagePayload = {
  reminderId: string;
  clientEventId: string;
  title: string;
  detail: string;
  venue: string;
  eventTime: string;
  reminderAt: string;
  lawyerName: string;
  clientName: string;
  lawyerId: string;
  clientId: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
}

export function serializeReminderMessage(payload: ReminderMessagePayload): string {
  return `${REMINDER_PREFIX}${JSON.stringify(payload)}`;
}

export function parseReminderMessage(body: unknown): ReminderMessagePayload | null {
  if (typeof body !== 'string') return null;
  const text = body.trim();
  if (!text.startsWith(REMINDER_PREFIX)) return null;

  const rawJson = text.slice(REMINDER_PREFIX.length);
  try {
    const parsed = JSON.parse(rawJson) as unknown;
    if (!isObject(parsed)) return null;

    const reminderId = toText(parsed.reminderId);
    const clientEventId = toText(parsed.clientEventId);
    const title = toText(parsed.title);
    const detail = toText(parsed.detail);
    const venue = toText(parsed.venue);
    const eventTime = toText(parsed.eventTime);
    const reminderAt = toText(parsed.reminderAt);
    const lawyerName = toText(parsed.lawyerName);
    const clientName = toText(parsed.clientName);
    const lawyerId = toText(parsed.lawyerId);
    const clientId = toText(parsed.clientId);

    if (!reminderId || !title || !eventTime || !reminderAt || !lawyerId || !clientId) {
      return null;
    }

    return {
      reminderId,
      clientEventId: clientEventId || reminderId,
      title,
      detail,
      venue,
      eventTime,
      reminderAt,
      lawyerName,
      clientName,
      lawyerId,
      clientId,
    };
  } catch {
    return null;
  }
}
