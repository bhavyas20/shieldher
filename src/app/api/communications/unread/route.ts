import { NextResponse } from 'next/server';
import {
  createAdminClient,
  getAuthenticatedUser,
} from '@/lib/communication/server';
import { isSystemCommunicationMessage } from '@/lib/communication/messageFilters';

export async function GET() {
  try {
    const requester = await getAuthenticatedUser();
    if (!requester) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = createAdminClient();
    const roleColumn = requester.role === 'lawyer' ? 'lawyer_id' : 'user_id';

    const { data: threadData, error: threadError } = await supabaseAdmin
      .from('communication_threads')
      .select('id')
      .eq(roleColumn, requester.id);

    if (threadError) {
      throw threadError;
    }

    const threadIds = ((threadData as { id: string }[] | null) ?? []).map((item) => item.id);
    if (threadIds.length === 0) {
      return NextResponse.json({ unreadCount: 0 });
    }

    const { data: unreadRows, error: unreadError } = await supabaseAdmin
      .from('communication_messages')
      .select('id, body')
      .in('thread_id', threadIds)
      .neq('sender_id', requester.id)
      .is('read_at', null);

    if (unreadError) {
      throw unreadError;
    }

    const unreadCount = (unreadRows ?? []).reduce((total, row) => {
      const message = row as { body?: unknown };
      return isSystemCommunicationMessage(message.body) ? total : total + 1;
    }, 0);

    return NextResponse.json({ unreadCount });
  } catch (error: unknown) {
    console.error('Unread communication count error:', error);
    return NextResponse.json({ error: 'Failed to load unread count' }, { status: 500 });
  }
}
