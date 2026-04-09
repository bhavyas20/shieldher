import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  asObject,
  createAdminClient,
  getAuthenticatedUser,
  toText,
} from '@/lib/communication/server';
import {
  getErrorMessage,
  getReminderSchemaSetupMessage,
  getSelectedLawyerId,
  getSelectedLawyerName,
  isMissingReminderTableError,
  normalize,
  type ReminderEventRow,
  toIso,
} from '@/lib/reminders/server';
import {
  parseReminderMessage,
  serializeReminderMessage,
  type ReminderMessagePayload,
} from '@/lib/reminders/payload';

type ReminderEventPayload = {
  title?: unknown;
  detail?: unknown;
  venue?: unknown;
  clientId?: unknown;
  client_id?: unknown;
  eventTime?: unknown;
  event_time?: unknown;
  reminderAt?: unknown;
  reminder_at?: unknown;
};

type ThreadRow = {
  id: string;
};

type ReminderMessageRow = {
  id: string;
  thread_id: string;
  body: string;
  created_at: string;
};

function sanitizeText(value: unknown, max = 240): string {
  return toText(value).trim().replace(/\s+/g, ' ').slice(0, max);
}

async function ensureThreadId(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  userId: string,
  lawyerId: string,
  userName: string,
  lawyerName: string
): Promise<string> {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('communication_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('lawyer_id', lawyerId)
    .maybeSingle();

  if (existingError) throw existingError;

  const existingId = sanitizeText(existing?.id, 80);
  if (existingId) return existingId;

  const { data: inserted, error: insertedError } = await supabaseAdmin
    .from('communication_threads')
    .insert({
      user_id: userId,
      lawyer_id: lawyerId,
      user_name: userName,
      lawyer_name: lawyerName,
      initiated_by_user_at: null,
    })
    .select('id')
    .single();

  if (!insertedError) {
    const insertedId = sanitizeText(inserted?.id, 80);
    if (insertedId) return insertedId;
  }

  const { data: retry, error: retryError } = await supabaseAdmin
    .from('communication_threads')
    .select('id')
    .eq('user_id', userId)
    .eq('lawyer_id', lawyerId)
    .maybeSingle();

  if (retryError) throw retryError;
  const retryId = sanitizeText(retry?.id, 80);
  if (retryId) return retryId;

  throw insertedError ?? new Error('Could not create communication thread');
}

async function listReminderEventsFromMessages(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  lawyerId: string
): Promise<ReminderEventRow[]> {
  const { data: threadData, error: threadError } = await supabaseAdmin
    .from('communication_threads')
    .select('id')
    .eq('lawyer_id', lawyerId)
    .limit(200);

  if (threadError) throw threadError;

  const threadIds = ((threadData as ThreadRow[] | null) ?? []).map((thread) => thread.id);
  if (threadIds.length === 0) return [];

  const { data: messageData, error: messageError } = await supabaseAdmin
    .from('communication_messages')
    .select('id, thread_id, body, created_at')
    .in('thread_id', threadIds)
    .like('body', 'HEARING_REMINDER::%')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (messageError) throw messageError;

  const byReminderId = new Map<string, ReminderEventRow>();

  for (const row of (messageData as ReminderMessageRow[] | null) ?? []) {
    const parsed = parseReminderMessage(row.body);
    if (!parsed) continue;
    if (normalize(parsed.lawyerId) !== normalize(lawyerId)) continue;
    if (byReminderId.has(parsed.reminderId)) continue;

    byReminderId.set(parsed.reminderId, {
      id: parsed.reminderId,
      lawyer_id: parsed.lawyerId,
      user_id: parsed.clientId,
      thread_id: row.thread_id || null,
      title: parsed.title,
      detail: parsed.detail,
      venue: parsed.venue,
      event_time: parsed.eventTime,
      reminder_at: parsed.reminderAt,
      client_name: parsed.clientName,
      lawyer_name: parsed.lawyerName,
      created_at: row.created_at,
    });
  }

  return Array.from(byReminderId.values()).sort((a, b) => {
    return new Date(a.event_time).getTime() - new Date(b.event_time).getTime();
  });
}

export async function GET() {
  try {
    const requester = await getAuthenticatedUser();
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'lawyer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabaseAdmin = createAdminClient();
    const { data, error } = await supabaseAdmin
      .from('hearing_reminders')
      .select(
        'id, lawyer_id, user_id, thread_id, title, detail, venue, event_time, reminder_at, client_name, lawyer_name, created_at'
      )
      .eq('lawyer_id', requester.id)
      .order('event_time', { ascending: true })
      .limit(300);

    if (error) {
      if (isMissingReminderTableError(error)) {
        const fallbackEvents = await listReminderEventsFromMessages(supabaseAdmin, requester.id);
        return NextResponse.json({
          events: fallbackEvents,
          configured: true,
          fallback: true,
        });
      }
      throw error;
    }

    return NextResponse.json({
      events: ((data as ReminderEventRow[] | null) ?? []).map((event) => ({
        id: event.id,
        lawyer_id: event.lawyer_id,
        user_id: event.user_id,
        thread_id: event.thread_id,
        title: event.title,
        detail: event.detail,
        venue: event.venue,
        event_time: event.event_time,
        reminder_at: event.reminder_at,
        client_name: event.client_name,
        lawyer_name: event.lawyer_name,
        created_at: event.created_at,
      })),
      configured: true,
    });
  } catch (error: unknown) {
    console.error('Lawyer calendar events load error:', error);
    return NextResponse.json({ error: 'Failed to load calendar events' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const requester = await getAuthenticatedUser();
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (requester.role !== 'lawyer') {
      return NextResponse.json({ error: 'Only lawyers can create hearings' }, { status: 403 });
    }

    const payload = (await request.json()) as ReminderEventPayload;

    const title = sanitizeText(payload.title, 140);
    const detail = sanitizeText(payload.detail, 400);
    const venue = sanitizeText(payload.venue, 180);
    const clientId = sanitizeText(payload.clientId ?? payload.client_id, 80);
    const eventTime = toIso(sanitizeText(payload.eventTime ?? payload.event_time, 64));
    const reminderAt = toIso(sanitizeText(payload.reminderAt ?? payload.reminder_at, 64));

    if (title.length < 2) {
      return NextResponse.json({ error: 'Event title is required' }, { status: 400 });
    }
    if (!clientId) {
      return NextResponse.json({ error: 'Client is required' }, { status: 400 });
    }
    if (!eventTime) {
      return NextResponse.json({ error: 'Valid event date and time is required' }, { status: 400 });
    }
    if (!reminderAt) {
      return NextResponse.json({ error: 'Valid reminder date and time is required' }, { status: 400 });
    }

    const eventTimeMs = new Date(eventTime).getTime();
    const reminderAtMs = new Date(reminderAt).getTime();
    if (reminderAtMs > eventTimeMs) {
      return NextResponse.json(
        { error: 'Reminder time cannot be after event time' },
        { status: 400 }
      );
    }

    const supabaseAdmin = createAdminClient();

    const { data: userLookup, error: userLookupError } =
      await supabaseAdmin.auth.admin.getUserById(clientId);
    if (userLookupError || !userLookup.user) {
      return NextResponse.json({ error: 'Client account not found' }, { status: 404 });
    }

    const clientUser = userLookup.user;
    const clientMetadata = asObject(clientUser.user_metadata);
    const clientRole = sanitizeText(clientMetadata.role, 10).toLowerCase();
    // Backward-compatible: some older client accounts may not have role metadata set.
    // We only hard-block lawyer accounts here.
    if (clientRole === 'lawyer') {
      return NextResponse.json({ error: 'Selected account is not a client user' }, { status: 400 });
    }

    const selectedLawyerId = normalize(getSelectedLawyerId(clientMetadata));
    const selectedLawyerName = normalize(getSelectedLawyerName(clientMetadata));
    const requesterLawyerId = normalize(requester.id);
    const requesterLawyerName = normalize(requester.fullName);

    const selectedById = Boolean(selectedLawyerId) && selectedLawyerId === requesterLawyerId;
    const selectedByName =
      Boolean(selectedLawyerName) &&
      Boolean(requesterLawyerName) &&
      selectedLawyerName === requesterLawyerName;

    if (!selectedById && !selectedByName) {
      return NextResponse.json(
        { error: 'This client is not linked to your lawyer profile' },
        { status: 403 }
      );
    }

    const clientName =
      sanitizeText(clientMetadata.full_name, 120) || clientUser.email?.split('@')[0] || 'ShieldHer User';

    const threadId = await ensureThreadId(
      supabaseAdmin,
      clientUser.id,
      requester.id,
      clientName,
      requester.fullName
    );

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('hearing_reminders')
      .insert({
        lawyer_id: requester.id,
        user_id: clientUser.id,
        thread_id: threadId,
        title,
        detail,
        venue,
        event_time: eventTime,
        reminder_at: reminderAt,
        client_name: clientName,
        lawyer_name: requester.fullName,
      })
      .select(
        'id, lawyer_id, user_id, thread_id, title, detail, venue, event_time, reminder_at, client_name, lawyer_name, created_at'
      )
      .single();

    if (insertError) {
      if (isMissingReminderTableError(insertError)) {
        const reminderId = randomUUID();
        const reminderPayload: ReminderMessagePayload = {
          reminderId,
          clientEventId: reminderId,
          title,
          detail,
          venue,
          eventTime,
          reminderAt,
          lawyerName: requester.fullName,
          clientName,
          lawyerId: requester.id,
          clientId: clientUser.id,
        };

        const { error: reminderMessageError } = await supabaseAdmin
          .from('communication_messages')
          .insert({
            thread_id: threadId,
            sender_id: requester.id,
            sender_role: 'lawyer',
            body: serializeReminderMessage(reminderPayload),
          });

        if (reminderMessageError) {
          throw reminderMessageError;
        }

        const fallbackEvent: ReminderEventRow = {
          id: reminderId,
          lawyer_id: requester.id,
          user_id: clientUser.id,
          thread_id: threadId,
          title,
          detail,
          venue,
          event_time: eventTime,
          reminder_at: reminderAt,
          client_name: clientName,
          lawyer_name: requester.fullName,
          created_at: new Date().toISOString(),
        };

        return NextResponse.json({ event: fallbackEvent, fallback: true }, { status: 201 });
      }
      throw insertError;
    }

    return NextResponse.json({ event: inserted as ReminderEventRow }, { status: 201 });
  } catch (error: unknown) {
    console.error('Lawyer calendar event create error:', error);
    if (isMissingReminderTableError(error)) {
      return NextResponse.json({ error: getReminderSchemaSetupMessage() }, { status: 500 });
    }
    const detail = getErrorMessage(error);
    return NextResponse.json(
      { error: detail || 'Failed to create calendar event' },
      { status: 500 }
    );
  }
}
