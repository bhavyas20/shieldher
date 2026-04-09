const SYSTEM_MESSAGE_PREFIXES = ['HEARING_REMINDER::', 'CASE_ACCEPTED::'] as const;

export function isSystemCommunicationMessage(body: unknown): boolean {
  if (typeof body !== 'string') return false;
  const text = body.trimStart();
  return SYSTEM_MESSAGE_PREFIXES.some((prefix) => text.startsWith(prefix));
}

