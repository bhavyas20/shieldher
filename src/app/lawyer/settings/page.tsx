'use client';

import { useEffect, useMemo, useState } from 'react';
import LawyerShell from '@/components/lawyer/LawyerShell';
import { createClient } from '@/lib/supabase/client';
import { Bell, CalendarDays, FilePenLine, Loader, RotateCcw, Save } from 'lucide-react';
import styles from '../workspace.module.css';

type SettingsKey = 'emergency_push_notifications' | 'calendar_sync' | 'draft_auto_save';

type LawyerWorkspaceSettings = Record<SettingsKey, boolean>;

const SETTINGS_METADATA_KEY = 'lawyer_workspace_settings';
const SETTINGS_UPDATED_AT_KEY = 'lawyer_workspace_settings_updated_at';

const DEFAULT_SETTINGS: LawyerWorkspaceSettings = {
  emergency_push_notifications: true,
  calendar_sync: true,
  draft_auto_save: true,
};

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function formatSavedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Just now';
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LawyerSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<LawyerWorkspaceSettings>(DEFAULT_SETTINGS);
  const [initialSettings, setInitialSettings] = useState<LawyerWorkspaceSettings>(DEFAULT_SETTINGS);
  const [lastSavedAt, setLastSavedAt] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadSettings() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Session expired. Please sign in again.');
        setLoading(false);
        return;
      }

      const metadata = asObject(user.user_metadata);
      const savedSettings = asObject(metadata[SETTINGS_METADATA_KEY]);
      const resolvedSettings: LawyerWorkspaceSettings = {
        emergency_push_notifications: parseBoolean(
          savedSettings.emergency_push_notifications,
          DEFAULT_SETTINGS.emergency_push_notifications
        ),
        calendar_sync: parseBoolean(savedSettings.calendar_sync, DEFAULT_SETTINGS.calendar_sync),
        draft_auto_save: parseBoolean(savedSettings.draft_auto_save, DEFAULT_SETTINGS.draft_auto_save),
      };

      setSettings(resolvedSettings);
      setInitialSettings(resolvedSettings);

      const savedAt = metadata[SETTINGS_UPDATED_AT_KEY];
      if (typeof savedAt === 'string') {
        setLastSavedAt(savedAt);
      }

      setLoading(false);
    }

    void loadSettings();
  }, []);

  const hasChanges = useMemo(() => {
    return (
      settings.emergency_push_notifications !== initialSettings.emergency_push_notifications ||
      settings.calendar_sync !== initialSettings.calendar_sync ||
      settings.draft_auto_save !== initialSettings.draft_auto_save
    );
  }, [initialSettings, settings]);

  function toggleSetting(key: SettingsKey) {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
    setMessage('');
    setError('');
  }

  async function handleSave() {
    if (!hasChanges) return;

    setSaving(true);
    setMessage('');
    setError('');

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError('Session expired. Please sign in again.');
      setSaving(false);
      return;
    }

    const existingMetadata = asObject(user.user_metadata);
    const savedAt = new Date().toISOString();
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        ...existingMetadata,
        [SETTINGS_METADATA_KEY]: settings,
        [SETTINGS_UPDATED_AT_KEY]: savedAt,
      },
    });

    if (updateError) {
      setError(updateError.message || 'Could not save settings right now.');
    } else {
      setInitialSettings(settings);
      setLastSavedAt(savedAt);
      setMessage('Settings saved successfully.');
    }

    setSaving(false);
  }

  function handleReset() {
    setSettings(initialSettings);
    setMessage('Changes reset to last saved state.');
    setError('');
  }

  return (
    <LawyerShell
      title="Settings"
      subtitle="Configure notifications, workspace preferences, and account-level controls."
    >
      <section className={styles.panel}>
        <div className={styles.settingsHeader}>
          <h3 className={styles.panelTitle}>Workspace Settings</h3>
          <p className={styles.settingsMeta}>
            {lastSavedAt ? `Last saved: ${formatSavedAt(lastSavedAt)}` : 'Not saved yet'}
          </p>
        </div>

        {loading ? (
          <div className={styles.placeholder}>
            <Loader size={16} className="animate-spin" /> Loading preferences...
          </div>
        ) : (
          <>
            <div className={styles.list}>
              <article className={styles.listItem}>
                <div className={styles.listItemHead}>
                  <p className={styles.primary}>Emergency Push Notifications</p>
                  <p className={styles.secondary}>Get immediate SOS updates from clients.</p>
                </div>
                <div className={styles.settingControl}>
                  <span
                    className={`${styles.badge} ${
                      settings.emergency_push_notifications ? styles.badgeActive : styles.badgeClosed
                    }`}
                  >
                    {settings.emergency_push_notifications ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${
                      settings.emergency_push_notifications ? styles.toggleSwitchOn : ''
                    }`}
                    onClick={() => toggleSetting('emergency_push_notifications')}
                    role="switch"
                    aria-checked={settings.emergency_push_notifications}
                    aria-label="Toggle emergency push notifications"
                  >
                    <span className={styles.toggleKnob} />
                    <Bell size={12} className={styles.toggleIcon} />
                  </button>
                </div>
              </article>

              <article className={styles.listItem}>
                <div className={styles.listItemHead}>
                  <p className={styles.primary}>Calendar Sync</p>
                  <p className={styles.secondary}>Sync upcoming hearings with your connected calendar.</p>
                </div>
                <div className={styles.settingControl}>
                  <span
                    className={`${styles.badge} ${
                      settings.calendar_sync ? styles.badgeActive : styles.badgeClosed
                    }`}
                  >
                    {settings.calendar_sync ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${settings.calendar_sync ? styles.toggleSwitchOn : ''}`}
                    onClick={() => toggleSetting('calendar_sync')}
                    role="switch"
                    aria-checked={settings.calendar_sync}
                    aria-label="Toggle calendar sync"
                  >
                    <span className={styles.toggleKnob} />
                    <CalendarDays size={12} className={styles.toggleIcon} />
                  </button>
                </div>
              </article>

              <article className={styles.listItem}>
                <div className={styles.listItemHead}>
                  <p className={styles.primary}>Draft Auto Save</p>
                  <p className={styles.secondary}>Save legal drafts automatically every 30 seconds.</p>
                </div>
                <div className={styles.settingControl}>
                  <span
                    className={`${styles.badge} ${
                      settings.draft_auto_save ? styles.badgeActive : styles.badgeClosed
                    }`}
                  >
                    {settings.draft_auto_save ? 'On' : 'Off'}
                  </span>
                  <button
                    type="button"
                    className={`${styles.toggleSwitch} ${settings.draft_auto_save ? styles.toggleSwitchOn : ''}`}
                    onClick={() => toggleSetting('draft_auto_save')}
                    role="switch"
                    aria-checked={settings.draft_auto_save}
                    aria-label="Toggle draft auto save"
                  >
                    <span className={styles.toggleKnob} />
                    <FilePenLine size={12} className={styles.toggleIcon} />
                  </button>
                </div>
              </article>
            </div>

            {error ? <div className={styles.settingsError}>{error}</div> : null}
            {message ? <div className={styles.settingsSuccess}>{message}</div> : null}

            <div className={styles.settingsActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => void handleSave()}
                disabled={!hasChanges || saving}
              >
                {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={handleReset}
                disabled={!hasChanges || saving}
              >
                <RotateCcw size={16} />
                Reset
              </button>
            </div>
          </>
        )}
      </section>
    </LawyerShell>
  );
}

