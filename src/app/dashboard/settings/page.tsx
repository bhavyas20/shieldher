'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User, Mail, Shield, LogOut, Save, Loader, Ghost, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [ghostMode, setGhostMode] = useState(false);
  const [togglingGhost, setTogglingGhost] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setEmail(user.email || '');
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, ghost_mode')
          .eq('id', user.id)
          .single();
          
        if (profile?.full_name) {
          setFullName(profile.full_name);
        }
        if (profile?.ghost_mode !== undefined) {
          setGhostMode(profile.ghost_mode);
        }
      }
      setLoading(false);
    }
    
    loadProfile();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id);

    if (updateError) {
      setError('Failed to update profile name.');
    } else {
      setMessage('Profile updated successfully.');
    }
    
    setSaving(false);
  };

  const handleToggleGhostMode = async () => {
    setTogglingGhost(true);
    const newValue = !ghostMode;

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setTogglingGhost(false);
      return;
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ ghost_mode: newValue })
      .eq('id', user.id);

    if (updateError) {
      setError('Failed to update Ghost Mode setting.');
    } else {
      setGhostMode(newValue);
      setMessage(newValue ? 'Ghost Mode enabled — data will be auto-deleted after 24 hours.' : 'Ghost Mode disabled.');
    }
    
    setTogglingGhost(false);
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  if (loading) {
    return (
      <div className={styles.page}>
         <div className="flex justify-center items-center h-64">
           <Loader className="animate-spin text-accent" size={32} />
         </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Account Settings</h1>
        <p className={styles.subtitle}>Manage your profile and account details.</p>
      </div>

      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <User className={styles.cardIcon} size={20} />
            <h2 className={styles.cardTitle}>Personal Information</h2>
          </div>
          
          <form onSubmit={handleSaveProfile} className={styles.form}>
            <div className={styles.field}>
              <label className="label" htmlFor="fullName">Full Name</label>
              <input
                id="fullName"
                type="text"
                className="input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            
            <div className={styles.field}>
              <label className="label" htmlFor="email">Email Address</label>
              <div className={styles.inputWrap}>
                <Mail size={16} className={styles.inputIcon} />
                <input
                  id="email"
                  type="email"
                  className={`input ${styles.inputWithIcon} ${styles.disabledInput}`}
                  value={email}
                  disabled
                  readOnly
                />
              </div>
              <p className={styles.helpText}>Email address cannot be changed currently.</p>
            </div>

            {error && <div className={styles.error}>{error}</div>}
            {message && <div className={styles.success}>{message}</div>}

            <div className={styles.actions}>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? (
                  <><Loader size={16} className="animate-spin" /> Saving...</>
                ) : (
                  <><Save size={16} /> Save Changes</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Ghost Mode Card */}
        <div className={`${styles.card} ${styles.ghostCard}`}>
          <div className={styles.cardHeader}>
            <Ghost className={styles.ghostIcon} size={20} />
            <h2 className={styles.cardTitle}>Ghost Mode</h2>
            <span className={`${styles.ghostBadge} ${ghostMode ? styles.ghostBadgeActive : ''}`}>
              {ghostMode ? 'ACTIVE' : 'OFF'}
            </span>
          </div>

          <div className={styles.ghostContent}>
            <p className={styles.ghostDesc}>
              When enabled, all your uploaded screenshots, analysis results, and generated reports 
              will be <strong>automatically deleted 24 hours</strong> after creation. This provides 
              maximum privacy for high-risk situations.
            </p>

            <div className={styles.ghostWarning}>
              <AlertTriangle size={16} />
              <p>
                <strong>Warning:</strong> Deleted data cannot be recovered. Make sure to download 
                any evidence PDFs you need before the 24-hour window expires.
              </p>
            </div>

            <div className={styles.ghostToggleRow}>
              <div>
                <span className={styles.ghostToggleLabel}>Auto-delete after 24 hours</span>
                <span className={styles.ghostToggleHint}>
                  {ghostMode ? 'Your data will be purged automatically' : 'Your data is stored permanently'}
                </span>
              </div>
              <button
                className={`${styles.toggleSwitch} ${ghostMode ? styles.toggleActive : ''}`}
                onClick={handleToggleGhostMode}
                disabled={togglingGhost}
                role="switch"
                aria-checked={ghostMode}
                aria-label="Toggle Ghost Mode"
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <Shield className={styles.cardIcon} size={20} color="var(--danger)" />
            <h2 className={styles.cardTitle}>Security & Access</h2>
          </div>
          
          <div className={styles.securitySection}>
            <p className={styles.securityText}>
              Ensure your account remains secure. You can sign out of your account on this device here.
            </p>
            <button onClick={handleSignOut} className="btn btn-secondary">
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
