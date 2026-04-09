'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import LawyerShell from '@/components/lawyer/LawyerShell';
import { useWorkspaceData } from '@/lib/lawyer/useWorkspaceData';
import styles from '../workspace.module.css';

type CalendarEventType = 'selection' | 'contact' | 'case' | 'hearing' | 'alert';

type CalendarEvent = {
  id: string;
  type: CalendarEventType;
  date: Date;
  title: string;
  detail: string;
};

type ReminderCalendarEvent = {
  id: string;
  user_id: string;
  title: string;
  detail: string;
  venue: string;
  event_time: string;
  reminder_at: string;
  client_name: string;
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const EVENT_LABELS: Record<CalendarEventType, string> = {
  selection: 'Lawyer chosen',
  contact: 'Client contacted',
  case: 'Case activity',
  hearing: 'Hearing',
  alert: 'Emergency alert',
};

const EVENT_PRIORITY: Record<CalendarEventType, number> = {
  hearing: 1,
  alert: 2,
  contact: 3,
  selection: 4,
  case: 5,
};

function parseDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildMonthGrid(month: Date): Date[] {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const offset = firstDay.getDay();
  const totalCells = Math.ceil((offset + lastDay.getDate()) / 7) * 7;
  const startDate = new Date(month.getFullYear(), month.getMonth(), 1 - offset);

  const dates: Date[] = [];
  for (let index = 0; index < totalCells; index += 1) {
    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + index);
    dates.push(nextDate);
  }

  return dates;
}

function formatMonthLabel(value: Date): string {
  return value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function formatDateLabel(value: Date): string {
  return value.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatDateTimeLabel(value: Date): string {
  return value.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function dateFromDayKey(value: string): Date {
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(year, month - 1, day);
}

function toDateInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(value: Date): string {
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function toIsoFromDateAndTime(dateText: string, timeText: string): string {
  const [yearText, monthText, dayText] = dateText.split('-');
  const [hoursText, minutesText] = timeText.split(':');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(localDate.getTime())) return '';
  return localDate.toISOString();
}

export default function CalendarPage() {
  const { data, loading, error, reload } = useWorkspaceData();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(() => dayKey(new Date()));
  const [customEvents, setCustomEvents] = useState<ReminderCalendarEvent[]>([]);
  const [customEventsConfigured, setCustomEventsConfigured] = useState(true);
  const [customEventsError, setCustomEventsError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [formError, setFormError] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDetail, setEventDetail] = useState('');
  const [eventVenue, setEventVenue] = useState('');
  const [eventDateInput, setEventDateInput] = useState('');
  const [eventTimeInput, setEventTimeInput] = useState('');
  const [reminderDateInput, setReminderDateInput] = useState('');
  const [reminderTimeInput, setReminderTimeInput] = useState('');
  const [clientId, setClientId] = useState('');
  const today = useMemo(() => new Date(), []);

  const loadCustomEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/lawyer/calendar/events', { cache: 'no-store' });
      const payload: unknown = await res.json();
      if (!res.ok) {
        const message = (payload as { error?: unknown }).error;
        throw new Error(typeof message === 'string' ? message : 'Could not load custom hearings');
      }

      const parsed = payload as {
        events?: ReminderCalendarEvent[];
        configured?: boolean;
        error?: string;
      };
      setCustomEvents(Array.isArray(parsed.events) ? parsed.events : []);
      setCustomEventsConfigured(parsed.configured !== false);
      setCustomEventsError(parsed.configured === false ? parsed.error || '' : '');
    } catch {
      setCustomEventsError('Could not load custom hearing reminders right now.');
    }
  }, []);

  useEffect(() => {
    void loadCustomEvents();
  }, [loadCustomEvents]);

  const events = useMemo<CalendarEvent[]>(() => {
    if (!data) return [];

    const items: CalendarEvent[] = [];

    for (const client of data.clients) {
      const selectedDate = parseDate(client.selected_at ?? client.joined_at);
      if (selectedDate) {
        items.push({
          id: `selection-${client.id}`,
          type: 'selection',
          date: selectedDate,
          title: `${client.name} chose you as lawyer`,
          detail: client.location || 'Client location unavailable',
        });
      }

      const contactedDate = parseDate(client.contacted_at ?? '');
      if (
        contactedDate &&
        (!selectedDate || contactedDate.getTime() !== selectedDate.getTime())
      ) {
        items.push({
          id: `contact-${client.id}`,
          type: 'contact',
          date: contactedDate,
          title: `${client.name} contacted legal support`,
          detail: 'First support interaction recorded',
        });
      }
    }

    for (const caseItem of data.cases) {
      const caseDate = parseDate(caseItem.updated_at);
      if (!caseDate) continue;

      items.push({
        id: `case-${caseItem.id}`,
        type: 'case',
        date: caseDate,
        title: caseItem.title,
        detail: `${caseItem.client_name} - ${caseItem.status}`,
      });
    }

    for (const hearing of data.hearings) {
      const hearingDate = parseDate(hearing.hearing_time);
      if (!hearingDate) continue;

      items.push({
        id: `hearing-${hearing.id}`,
        type: 'hearing',
        date: hearingDate,
        title: hearing.case_title,
        detail: hearing.venue || 'Venue not available',
      });
    }

    for (const alert of data.emergency_alerts) {
      const alertDate = parseDate(alert.time);
      if (!alertDate) continue;

      items.push({
        id: `alert-${alert.id}`,
        type: 'alert',
        date: alertDate,
        title: `${alert.client_name} - ${alert.severity.toUpperCase()} alert`,
        detail: alert.location || 'Location unavailable',
      });
    }

    for (const reminder of customEvents) {
      const reminderDate = parseDate(reminder.event_time);
      if (!reminderDate) continue;

      const detailBits = [reminder.client_name ? `Client: ${reminder.client_name}` : '', reminder.venue]
        .filter(Boolean)
        .join(' • ');

      items.push({
        id: `custom-hearing-${reminder.id}`,
        type: 'hearing',
        date: reminderDate,
        title: reminder.title,
        detail: reminder.detail || detailBits || 'Hearing reminder scheduled',
      });
    }

    return items.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [customEvents, data]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();

    for (const event of events) {
      const key = dayKey(event.date);
      const current = map.get(key);
      if (!current) {
        map.set(key, [event]);
      } else {
        current.push(event);
      }
    }

    for (const [key, dayEvents] of map.entries()) {
      dayEvents.sort((a, b) => {
        if (a.date.getTime() !== b.date.getTime()) {
          return a.date.getTime() - b.date.getTime();
        }

        return EVENT_PRIORITY[a.type] - EVENT_PRIORITY[b.type];
      });
      map.set(key, dayEvents);
    }

    return map;
  }, [events]);

  const monthDays = useMemo(() => buildMonthGrid(visibleMonth), [visibleMonth]);
  const selectedDayEvents = eventsByDay.get(selectedDateKey) ?? [];

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return events.filter((event) => event.date.getTime() >= now.getTime()).slice(0, 8);
  }, [events]);

  const monthEventCount = useMemo(() => {
    const selectedMonth = monthKey(visibleMonth);
    return events.filter((event) => monthKey(event.date) === selectedMonth).length;
  }, [events, visibleMonth]);

  function moveMonth(offset: number) {
    setVisibleMonth((current) => {
      const nextMonth = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      setSelectedDateKey(dayKey(nextMonth));
      return nextMonth;
    });
  }

  function jumpToToday() {
    const now = new Date();
    setVisibleMonth(startOfMonth(now));
    setSelectedDateKey(dayKey(now));
  }

  function openCreateModal(targetDate: Date) {
    const normalizedDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      10,
      0,
      0,
      0
    );
    const reminderDate = new Date(normalizedDate.getTime() - 30 * 60 * 1000);

    setSelectedDateKey(dayKey(targetDate));
    setEventTitle('');
    setEventDetail('');
    setEventVenue('');
    setEventDateInput(toDateInputValue(normalizedDate));
    setEventTimeInput(toTimeInputValue(normalizedDate));
    setReminderDateInput(toDateInputValue(reminderDate));
    setReminderTimeInput(toTimeInputValue(reminderDate));
    setClientId(data?.clients[0]?.id ?? '');
    setFormError('');
    setModalOpen(true);
  }

  async function handleCreateEvent(event: FormEvent) {
    event.preventDefault();
    if (savingEvent) return;
    if (!customEventsConfigured) {
      setFormError('Reminder storage is not configured yet. Please run the SQL schema update first.');
      return;
    }

    const title = eventTitle.trim();
    if (title.length < 2) {
      setFormError('Please enter an event title.');
      return;
    }

    if (!clientId) {
      setFormError('Please choose a client for this hearing reminder.');
      return;
    }

    const eventTime = toIsoFromDateAndTime(eventDateInput, eventTimeInput);
    const reminderAt = toIsoFromDateAndTime(reminderDateInput, reminderTimeInput);

    if (!eventTime || !reminderAt) {
      setFormError('Please provide valid event and reminder date/time.');
      return;
    }

    if (new Date(reminderAt).getTime() > new Date(eventTime).getTime()) {
      setFormError('Reminder time must be before (or equal to) event time.');
      return;
    }

    try {
      setSavingEvent(true);
      setFormError('');

      const response = await fetch('/api/lawyer/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          detail: eventDetail.trim(),
          venue: eventVenue.trim(),
          clientId,
          eventTime,
          reminderAt,
        }),
      });

      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = (payload as { error?: unknown }).error;
        throw new Error(typeof message === 'string' ? message : 'Could not create hearing reminder');
      }

      setModalOpen(false);
      await Promise.all([loadCustomEvents(), reload()]);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not create hearing reminder';
      setFormError(message);
    } finally {
      setSavingEvent(false);
    }
  }

  return (
    <LawyerShell
      title="Calendar"
      subtitle="Case timeline calendar with client selection, contact, and hearing milestones."
    >
      <section className={styles.panel}>
        <div className={styles.calendarToolbar}>
          <div>
            <h3 className={styles.panelTitle}>Case Calendar</h3>
            <p className={styles.calendarMeta}>
              {formatMonthLabel(visibleMonth)} - {monthEventCount} marked events
            </p>
          </div>
          <div className={styles.calendarActions}>
            <button type="button" className={styles.calendarButton} onClick={() => moveMonth(-1)}>
              Prev
            </button>
            <button type="button" className={styles.calendarButton} onClick={jumpToToday}>
              Today
            </button>
            <button type="button" className={styles.calendarButton} onClick={() => moveMonth(1)}>
              Next
            </button>
            <button
              type="button"
              className={`${styles.calendarButton} ${styles.calendarButtonPrimary}`}
              onClick={() => openCreateModal(dateFromDayKey(selectedDateKey))}
            >
              Add Hearing
            </button>
          </div>
        </div>
        {!customEventsConfigured ? (
          <div className={styles.placeholder}>
            Reminder storage is not configured yet. Run the latest SQL schema once to enable hearing
            reminders and alerts.
          </div>
        ) : null}
        {customEventsError ? <div className={styles.settingsError}>{customEventsError}</div> : null}

        {error ? (
          <div className={styles.placeholder}>{error}</div>
        ) : loading ? (
          <div className={styles.placeholder}>Loading timeline calendar...</div>
        ) : (
          <div className={styles.calendarLayout}>
            <div className={styles.calendarGridWrap}>
              <div className={styles.calendarWeekHeader}>
                {DAY_NAMES.map((dayName) => (
                  <span key={dayName} className={styles.calendarWeekLabel}>
                    {dayName}
                  </span>
                ))}
              </div>
              <div className={styles.calendarGrid}>
                {monthDays.map((date) => {
                  const key = dayKey(date);
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const inCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                  const isSelected = key === selectedDateKey;
                  const isToday = key === dayKey(today);

                  return (
                    <button
                      key={key}
                      type="button"
                      className={[
                        styles.calendarCell,
                        inCurrentMonth ? '' : styles.calendarCellMuted,
                        isSelected ? styles.calendarCellSelected : '',
                        isToday ? styles.calendarCellToday : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => openCreateModal(date)}
                    >
                      <span className={styles.calendarDate}>{date.getDate()}</span>
                      <span className={styles.calendarDayCount}>
                        {dayEvents.length > 0 ? `${dayEvents.length} event(s)` : 'No events'}
                      </span>
                      <span className={styles.calendarDots}>
                        {dayEvents.slice(0, 3).map((event) => (
                          <span
                            key={event.id}
                            className={`${styles.calendarDot} ${styles[`calendarDot${event.type}`]}`}
                            title={`${EVENT_LABELS[event.type]}: ${event.title}`}
                          />
                        ))}
                        {dayEvents.length > 3 ? (
                          <span className={styles.calendarMore}>+{dayEvents.length - 3}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <aside className={styles.calendarSidebar}>
              <div className={styles.calendarLegend}>
                {(Object.keys(EVENT_LABELS) as CalendarEventType[]).map((type) => (
                  <span key={type} className={styles.calendarLegendItem}>
                    <span className={`${styles.calendarDot} ${styles[`calendarDot${type}`]}`} />
                    {EVENT_LABELS[type]}
                  </span>
                ))}
              </div>

              <div className={styles.calendarAgenda}>
                <h4 className={styles.primary}>{formatDateLabel(dateFromDayKey(selectedDateKey))}</h4>
                {selectedDayEvents.length === 0 ? (
                  <p className={styles.secondary}>No case milestones recorded for this day.</p>
                ) : (
                  <div className={styles.calendarAgendaList}>
                    {selectedDayEvents.map((event) => (
                      <article key={event.id} className={styles.calendarAgendaItem}>
                        <span className={`${styles.badge} ${styles[`calendarTag${event.type}`]}`}>
                          {EVENT_LABELS[event.type]}
                        </span>
                        <p className={styles.primary}>{event.title}</p>
                        <p className={styles.secondary}>{event.detail}</p>
                        <p className={styles.calendarTime}>{formatDateTimeLabel(event.date)}</p>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.calendarAgenda}>
                <h4 className={styles.primary}>Upcoming</h4>
                {upcomingEvents.length === 0 ? (
                  <p className={styles.secondary}>No upcoming milestones recorded.</p>
                ) : (
                  <div className={styles.calendarUpcomingList}>
                    {upcomingEvents.map((event) => (
                      <article key={`${event.id}-upcoming`} className={styles.calendarUpcomingItem}>
                        <p className={styles.primary}>{event.title}</p>
                        <p className={styles.secondary}>
                          {EVENT_LABELS[event.type]} - {formatDateTimeLabel(event.date)}
                        </p>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </section>

      {modalOpen ? (
        <div
          className={styles.calendarModalOverlay}
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setModalOpen(false);
            }
          }}
        >
          <section className={styles.calendarModal} aria-label="Create hearing reminder">
            <div className={styles.calendarModalHeader}>
              <div>
                <h3 className={styles.panelTitle}>Create Hearing Reminder</h3>
                <p className={styles.secondary}>
                  Add a calendar event and set reminder timing for both lawyer and client.
                </p>
              </div>
              <button
                type="button"
                className={styles.calendarModalClose}
                onClick={() => setModalOpen(false)}
                aria-label="Close create hearing modal"
              >
                Close
              </button>
            </div>

            <form className={styles.calendarForm} onSubmit={handleCreateEvent}>
              <label className={styles.calendarField}>
                <span>Event Name</span>
                <input
                  value={eventTitle}
                  onChange={(next) => setEventTitle(next.target.value)}
                  placeholder="e.g., Family Court Hearing"
                  maxLength={140}
                  required
                />
              </label>

              <label className={styles.calendarField}>
                <span>Client</span>
                <select
                  value={clientId}
                  onChange={(next) => setClientId(next.target.value)}
                  required
                  disabled={(data?.clients.length ?? 0) === 0}
                >
                  {(data?.clients ?? []).length === 0 ? (
                    <option value="">No linked client available</option>
                  ) : (
                    <>
                      <option value="">Select a client</option>
                      {(data?.clients ?? []).map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </label>

              <div className={styles.calendarFormRow}>
                <label className={styles.calendarField}>
                  <span>Event Date</span>
                  <input
                    type="date"
                    value={eventDateInput}
                    onChange={(next) => setEventDateInput(next.target.value)}
                    required
                  />
                </label>
                <label className={styles.calendarField}>
                  <span>Event Time</span>
                  <input
                    type="time"
                    value={eventTimeInput}
                    onChange={(next) => setEventTimeInput(next.target.value)}
                    required
                  />
                </label>
              </div>

              <div className={styles.calendarFormRow}>
                <label className={styles.calendarField}>
                  <span>Reminder Date</span>
                  <input
                    type="date"
                    value={reminderDateInput}
                    onChange={(next) => setReminderDateInput(next.target.value)}
                    required
                  />
                </label>
                <label className={styles.calendarField}>
                  <span>Reminder Time</span>
                  <input
                    type="time"
                    value={reminderTimeInput}
                    onChange={(next) => setReminderTimeInput(next.target.value)}
                    required
                  />
                </label>
              </div>

              <label className={styles.calendarField}>
                <span>Venue (Optional)</span>
                <input
                  value={eventVenue}
                  onChange={(next) => setEventVenue(next.target.value)}
                  placeholder="Court no., meeting room, or location"
                  maxLength={180}
                />
              </label>

              <label className={styles.calendarField}>
                <span>Notes (Optional)</span>
                <textarea
                  value={eventDetail}
                  onChange={(next) => setEventDetail(next.target.value)}
                  placeholder="Additional event detail to show in reminder popup"
                  rows={3}
                  maxLength={400}
                />
              </label>

              {!customEventsConfigured ? (
                <div className={styles.settingsError}>
                  Save is blocked because reminder storage is not configured in Supabase yet.
                  Run schema section 8 for <code>hearing_reminders</code>, then refresh this page.
                </div>
              ) : null}

              {formError ? <div className={styles.settingsError}>{formError}</div> : null}

              <div className={styles.settingsActions}>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() => setModalOpen(false)}
                  disabled={savingEvent}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`${styles.btnPrimary} ${savingEvent ? styles.btnDisabled : ''}`}
                  disabled={savingEvent}
                >
                  {savingEvent
                    ? 'Saving...'
                    : customEventsConfigured
                      ? 'Save Reminder'
                      : 'Setup Required'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </LawyerShell>
  );
}
