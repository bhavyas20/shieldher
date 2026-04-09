import { NextResponse } from 'next/server';
import { createAdminClient, getAuthenticatedUser } from '@/lib/communication/server';
import {
  isMissingReminderTableError,
  type ReminderEventRow,
} from '@/lib/reminders/server';
import { parseReminderMessage } from '@/lib/reminders/payload';

type ReminderDueResponseItem = {
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

type ThreadRow = {
  id: string;
};

type ReminderMessageRow = {
  thread_id: string;
  body: string;
  created_at: string;
};

function asSeenSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  const items = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
  return new Set(items);
}

export async function GET() {
  try {
    const requester = await getAuthenticatedUser();
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();
    const participantIdColumn = requester.role === 'lawyer' ? 'lawyer_id' : 'user_id';
    const notifiedColumn = requester.role === 'lawyer' ? 'notified_lawyer_at' : 'notified_user_at';
    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('hearing_reminders')
      .select(
        'id, lawyer_id, user_id, thread_id, title, detail, venue, event_time, reminder_at, client_name, lawyer_name, created_at'
      )
      .eq(participantIdColumn, requester.id)
      .is(notifiedColumn, null)
      .lte('reminder_at', nowIso)
      .order('reminder_at', { ascending: true })
      .limit(30);

    if (error) {
      if (isMissingReminderTableError(error)) {
        const roleColumn = requester.role === 'lawyer' ? 'lawyer_id' : 'user_id';
        const { data: threadData, error: threadError } = await supabaseAdmin
          .from('communication_threads')
          .select('id')
          .eq(roleColumn, requester.id)
          .limit(200);

        if (threadError) throw threadError;

        const threadIds = ((threadData as ThreadRow[] | null) ?? []).map((thread) => thread.id);
        if (threadIds.length === 0) {
          return NextResponse.json({ notifications: [] as ReminderDueResponseItem[], configured: true });
        }

        const { data: messageData, error: messageError } = await supabaseAdmin
          .from('communication_messages')
          .select('thread_id, body, created_at')
          .in('thread_id', threadIds)
          .like('body', 'HEARING_REMINDER::%')
          .order('created_at', { ascending: false })
          .limit(1200);

        if (messageError) throw messageError;

        const seenSet = asSeenSet(requester.metadata.reminder_notifications_seen);
        const dueByReminderId = new Map<string, ReminderDueResponseItem>();
        const dueIds: string[] = [];

        for (const row of (messageData as ReminderMessageRow[] | null) ?? []) {
          const parsed = parseReminderMessage(row.body);
          if (!parsed) continue;
          const isParticipant =
            requester.role === 'lawyer'
              ? parsed.lawyerId === requester.id
              : parsed.clientId === requester.id;
          if (!isParticipant) continue;

          const dueAtMs = new Date(parsed.reminderAt).getTime();
          if (Number.isNaN(dueAtMs) || dueAtMs > Date.now()) continue;
          if (seenSet.has(parsed.reminderId)) continue;
          if (dueByReminderId.has(parsed.reminderId)) continue;

          dueByReminderId.set(parsed.reminderId, {
            id: parsed.reminderId,
            title: parsed.title,
            detail: parsed.detail,
            venue: parsed.venue,
            event_time: parsed.eventTime,
            reminder_at: parsed.reminderAt,
            client_name: parsed.clientName,
            lawyer_name: parsed.lawyerName,
            thread_id: row.thread_id || null,
          });
          dueIds.push(parsed.reminderId);
        }

        const notifications = Array.from(dueByReminderId.values())
          .sort((a, b) => new Date(a.reminder_at).getTime() - new Date(b.reminder_at).getTime())
          .slice(0, 20);

        if (notifications.length > 0) {
          const existingSeen = Array.from(seenSet);
          const merged = [...existingSeen, ...dueIds].slice(-300);
          const { error: updateMetadataError } = await supabaseAdmin.auth.admin.updateUserById(
            requester.id,
            {
              user_metadata: {
                ...requester.metadata,
                reminder_notifications_seen: merged,
              },
            }
          );
          if (updateMetadataError) {
            console.error('Reminder fallback metadata update error:', updateMetadataError);
          }
        }

        return NextResponse.json({ notifications, configured: true, fallback: true });
      }
      throw error;
    }

    const dueRows = (data as ReminderEventRow[] | null) ?? [];
    if (dueRows.length === 0) {
      return NextResponse.json({ notifications: [] as ReminderDueResponseItem[], configured: true });
    }

    const reminderIds = dueRows.map((row) => row.id);
    const updatePayload: Record<string, string> = { [notifiedColumn]: nowIso };

    const { error: updateError } = await supabaseAdmin
      .from('hearing_reminders')
      .update(updatePayload)
      .in('id', reminderIds)
      .is(notifiedColumn, null);

    if (updateError && !isMissingReminderTableError(updateError)) {
      throw updateError;
    }

    const notifications: ReminderDueResponseItem[] = dueRows.map((row) => ({
      id: row.id,
      title: row.title,
      detail: row.detail,
      venue: row.venue,
      event_time: row.event_time,
      reminder_at: row.reminder_at,
      client_name: row.client_name,
      lawyer_name: row.lawyer_name,
      thread_id: row.thread_id,
    }));

    return NextResponse.json({ notifications, configured: true });
  } catch (error: unknown) {
    console.error('Due reminder notifications error:', error);
    return NextResponse.json({ error: 'Failed to fetch due reminders' }, { status: 500 });
  }
}
