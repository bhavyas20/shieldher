'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { BriefcaseBusiness, Loader, MapPin, Phone, Scale } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

type UserRole = 'user' | 'lawyer';

type LawyerProfile = {
  id: string;
  full_name: string;
  short_bio: string;
  specialization: string;
  office_city: string;
  years_of_experience: string;
  bar_council_id: string;
  contact_number: string;
  joined_at: string;
};

function parseRole(value: unknown): UserRole | null {
  if (value === 'lawyer' || value === 'user') return value;
  return null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toText(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return '';
}

function formatJoinDate(dateStr: string) {
  if (!dateStr) return 'Unknown';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function LawyerProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const lawyerId = useMemo(() => String(params?.id ?? '').trim(), [params]);

  const [loading, setLoading] = useState(true);
  const [savingSelection, setSavingSelection] = useState(false);
  const [contacting, setContacting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lawyer, setLawyer] = useState<LawyerProfile | null>(null);
  const [selectedLawyerId, setSelectedLawyerId] = useState('');

  const saveLawyerSelection = async (options?: { markContacted?: boolean }) => {
    if (!lawyer) return false;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace('/auth');
      return false;
    }

    const existingMetadata = asObject(user.user_metadata);
    const nowIso = new Date().toISOString();
    const selectedAt = toText(existingMetadata.selected_lawyer_at) || nowIso;

    const nextMetadata: Record<string, unknown> = {
      ...existingMetadata,
      selected_lawyer_id: lawyer.id,
      selected_lawyer_name: lawyer.full_name,
      selected_lawyer_at: selectedAt,
      selected_lawyer: {
        id: lawyer.id,
        name: lawyer.full_name,
      },
    };

    if (options?.markContacted) {
      nextMetadata.contacted_lawyer_at = nowIso;
      nextMetadata.lawyer_contacted_at = nowIso;
      nextMetadata.contacted_at = nowIso;
      nextMetadata.first_contact_at = toText(existingMetadata.first_contact_at) || nowIso;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: nextMetadata,
    });
    if (updateError) throw updateError;

    window.localStorage.setItem('shieldher_selected_lawyer_id', lawyer.id);
    window.localStorage.setItem('shieldher_selected_lawyer_name', lawyer.full_name);
    setSelectedLawyerId(lawyer.id);
    return true;
  };

  useEffect(() => {
    async function load() {
      if (!lawyerId) {
        setError('Invalid lawyer profile.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace('/auth');
        return;
      }

      const role = parseRole(user.user_metadata?.role);
      if (role === 'lawyer') {
        router.replace('/lawyer/dashboard');
        return;
      }

      const metadata = asObject(user.user_metadata);
      setSelectedLawyerId(toText(metadata.selected_lawyer_id));

      try {
        setLoading(true);
        setError('');
        const res = await fetch(`/api/lawyers/${lawyerId}`, { cache: 'no-store' });
        const data: unknown = await res.json();
        if (!res.ok) {
          throw new Error('Failed to load lawyer profile');
        }

        const nextLawyer = (data as { lawyer?: LawyerProfile }).lawyer;
        if (!nextLawyer) throw new Error('Lawyer profile missing');
        setLawyer(nextLawyer);
      } catch {
        setError('Could not load this lawyer profile right now.');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [lawyerId, router]);

  const handleSelectLawyer = async () => {
    try {
      setMessage('');
      setError('');
      setSavingSelection(true);
      const saved = await saveLawyerSelection();
      if (!saved) return;
      setMessage('Lawyer selected successfully.');
    } catch {
      setError('Could not save lawyer selection right now.');
    } finally {
      setSavingSelection(false);
    }
  };

  const handleContactLawyer = async () => {
    if (!lawyer) return;

    try {
      setMessage('');
      setError('');
      setContacting(true);

      const saved = await saveLawyerSelection({ markContacted: true });
      if (!saved) return;

      const res = await fetch('/api/communications/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lawyerId: lawyer.id }),
      });
      const data: unknown = await res.json();

      if (!res.ok) {
        const apiError = toText((data as { error?: unknown }).error);
        throw new Error(apiError || 'Failed to start conversation');
      }

      const threadId = toText((data as { threadId?: unknown }).threadId);
      if (!threadId) {
        throw new Error('Conversation id missing');
      }

      router.push(`/dashboard/communication?thread=${threadId}`);
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message)
          : '';
      setError(message || 'Could not start conversation right now. Please try again.');
    } finally {
      setContacting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <Loader size={28} className="animate-spin" />
        <span>Loading lawyer profile...</span>
      </div>
    );
  }

  if (!lawyer) {
    return (
      <div className={styles.page}>
        {error ? <div className={styles.error}>{error}</div> : null}
        <Link href="/dashboard/lawyers" className={styles.backLink}>
          Back to Lawyers Directory
        </Link>
      </div>
    );
  }

  const isSelected = selectedLawyerId === lawyer.id;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.label}>Lawyer Profile</p>
          <h1 className={styles.title}>{lawyer.full_name}</h1>
          <p className={styles.subtitle}>Joined {formatJoinDate(lawyer.joined_at)}</p>
        </div>
        <Link href="/dashboard/lawyers" className={styles.backLink}>
          Back to Directory
        </Link>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {message ? <div className={styles.success}>{message}</div> : null}

      <section className={styles.profileCard}>
        <div className={styles.topRow}>
          <span className={styles.chip}>{lawyer.specialization}</span>
          <span className={styles.status}>{isSelected ? 'Selected Lawyer' : 'Available'}</span>
        </div>

        {lawyer.short_bio ? <p className={styles.bio}>{lawyer.short_bio}</p> : null}

        <div className={styles.metaGrid}>
          <div className={styles.metaItem}>
            <MapPin size={16} />
            <span>{lawyer.office_city}</span>
          </div>
          <div className={styles.metaItem}>
            <Scale size={16} />
            <span>{lawyer.years_of_experience} years experience</span>
          </div>
          <div className={styles.metaItem}>
            <Phone size={16} />
            <span>{lawyer.contact_number}</span>
          </div>
          <div className={styles.metaItem}>
            <BriefcaseBusiness size={16} />
            <span>{lawyer.specialization}</span>
          </div>
        </div>

        <div className={styles.footer}>
          <span>Bar Council ID</span>
          <strong>{lawyer.bar_council_id}</strong>
        </div>

        <div className={styles.actionRow}>
          <button
            type="button"
            className={`${styles.actionBtn} ${isSelected ? styles.actionBtnSelected : styles.actionBtnPrimary}`}
            onClick={handleSelectLawyer}
            disabled={savingSelection}
          >
            {savingSelection ? 'Saving...' : isSelected ? 'Selected Lawyer' : 'Select Lawyer'}
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            onClick={handleContactLawyer}
            disabled={contacting}
          >
            {contacting ? 'Connecting...' : 'Contact Lawyer'}
          </button>
        </div>
      </section>
    </div>
  );
}
