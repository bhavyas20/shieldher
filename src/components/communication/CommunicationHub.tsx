'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader, MessageSquare, Send } from 'lucide-react';
import styles from './CommunicationHub.module.css';

type ConversationItem = {
  id: string;
  counterpart_id: string;
  counterpart_name: string;
  unread_count: number;
  last_message: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

type MessageItem = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: 'user' | 'lawyer';
  body: string;
  read_at: string | null;
  created_at: string;
};

const POLL_MS = 8000;

function formatDateTime(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CommunicationHub() {
  const searchParams = useSearchParams();
  const requestedThreadId = searchParams.get('thread') || '';
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [role, setRole] = useState<'user' | 'lawyer'>('user');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [activeThreadId, setActiveThreadId] = useState('');

  const activeConversation = useMemo(
    () => conversations.find((item) => item.id === activeThreadId) ?? null,
    [conversations, activeThreadId]
  );

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/communications', { cache: 'no-store' });
      const payload: unknown = await res.json();
      if (!res.ok) {
        throw new Error('Could not load conversation list');
      }

      const parsed = payload as {
        role?: 'user' | 'lawyer';
        conversations?: ConversationItem[];
      };

      const nextRole = parsed.role === 'lawyer' ? 'lawyer' : 'user';
      const nextConversations = Array.isArray(parsed.conversations) ? parsed.conversations : [];

      setRole(nextRole);
      setConversations(nextConversations);
      setActiveThreadId((current) => {
        if (current && nextConversations.some((item) => item.id === current)) return current;
        if (requestedThreadId && nextConversations.some((item) => item.id === requestedThreadId)) {
          return requestedThreadId;
        }
        return nextConversations[0]?.id ?? '';
      });
      setError('');
    } catch {
      setError('Could not load conversations right now.');
    } finally {
      setLoading(false);
    }
  }, [requestedThreadId]);

  const loadMessages = useCallback(async (threadId: string) => {
    if (!threadId) {
      setMessages([]);
      return;
    }

    try {
      setLoadingMessages(true);
      const res = await fetch(`/api/communications/${threadId}/messages`, { cache: 'no-store' });
      const payload: unknown = await res.json();
      if (!res.ok) {
        throw new Error('Could not load messages');
      }

      const parsed = payload as { messages?: MessageItem[] };
      setMessages(Array.isArray(parsed.messages) ? parsed.messages : []);
    } catch {
      setError('Could not load thread messages.');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const markRead = useCallback(async (threadId: string) => {
    if (!threadId) return;
    try {
      await fetch(`/api/communications/${threadId}/read`, {
        method: 'POST',
      });
    } catch {
      // Silence: message polling will retry.
    }
  }, []);

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => {
      void loadConversations();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadConversations]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }

    async function syncThread(shouldRefreshList: boolean) {
      await Promise.all([loadMessages(activeThreadId), markRead(activeThreadId)]);
      if (shouldRefreshList) {
        await loadConversations();
      }
    }

    void syncThread(true);
    const timer = window.setInterval(() => {
      void syncThread(false);
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [activeThreadId, loadConversations, loadMessages, markRead]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeThreadId || sending) return;

    const text = draft.trim();
    if (!text) return;

    try {
      setSending(true);
      const res = await fetch(`/api/communications/${activeThreadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        throw new Error('Could not send message');
      }

      setDraft('');
      await Promise.all([loadMessages(activeThreadId), loadConversations()]);
    } catch {
      setError('Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={styles.chatShell}>
      {error ? <div className={styles.error}>{error}</div> : null}
      <div className={styles.chatLayout}>
        <aside className={styles.threadList}>
          <div className={styles.threadHeader}>
            <h3>{role === 'lawyer' ? 'Client Conversations' : 'Lawyer Conversations'}</h3>
          </div>

          {loading ? (
            <div className={styles.loading}>
              <Loader size={16} className="animate-spin" />
              <span>Loading threads...</span>
            </div>
          ) : conversations.length === 0 ? (
            <div className={styles.emptyState}>
              <MessageSquare size={18} />
              <p>
                {role === 'lawyer'
                  ? 'No client conversations yet.'
                  : 'Start by clicking Contact in Lawyers directory.'}
              </p>
            </div>
          ) : (
            <div className={styles.threadItems}>
              {conversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`${styles.threadBtn} ${item.id === activeThreadId ? styles.threadBtnActive : ''}`}
                  onClick={() => setActiveThreadId(item.id)}
                >
                  <div className={styles.threadTop}>
                    <strong>{item.counterpart_name}</strong>
                    {item.unread_count > 0 ? (
                      <span className={styles.unreadPill}>{item.unread_count}</span>
                    ) : null}
                  </div>
                  <p>{item.last_message}</p>
                  <time>{formatDateTime(item.last_message_at)}</time>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className={styles.messagePane}>
          {!activeConversation ? (
            <div className={styles.placeholder}>
              <MessageSquare size={20} />
              <p>Select a conversation to start chatting.</p>
            </div>
          ) : (
            <>
              <header className={styles.messageHeader}>
                <h4>{activeConversation.counterpart_name}</h4>
                <span>Secure communication channel</span>
              </header>

              <div className={styles.messageList}>
                {loadingMessages ? (
                  <div className={styles.loading}>
                    <Loader size={16} className="animate-spin" />
                    <span>Loading messages...</span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className={styles.placeholder}>
                    <MessageSquare size={20} />
                    <p>No messages yet. Send the first message.</p>
                  </div>
                ) : (
                  messages.map((message) => {
                    const mine = message.sender_role === role;
                    return (
                      <div
                        key={message.id}
                        className={`${styles.bubbleWrap} ${mine ? styles.bubbleWrapMine : ''}`}
                      >
                        <div className={`${styles.bubble} ${mine ? styles.bubbleMine : styles.bubbleOther}`}>
                          <p>{message.body}</p>
                          <time>{formatDateTime(message.created_at)}</time>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form className={styles.composer} onSubmit={handleSend}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type a message..."
                  rows={2}
                  maxLength={2000}
                />
                <button type="submit" disabled={sending || !draft.trim()}>
                  {sending ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
                  <span>{sending ? 'Sending...' : 'Send'}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
