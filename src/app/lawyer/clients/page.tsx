'use client';

import LawyerShell from '@/components/lawyer/LawyerShell';
import Link from 'next/link';
import { useWorkspaceData } from '@/lib/lawyer/useWorkspaceData';
import styles from '../workspace.module.css';

function severityClass(severity: 'critical' | 'high' | 'medium') {
  if (severity === 'critical') return `${styles.badge} ${styles.badgeCritical}`;
  if (severity === 'high') return `${styles.badge} ${styles.badgeHigh}`;
  return `${styles.badge} ${styles.badgeMedium}`;
}

export default function ClientsPage() {
  const { data, loading, error } = useWorkspaceData();
  const selectedClients = data?.clients ?? [];
  const emergencyAlerts = data?.emergency_alerts ?? [];

  return (
    <LawyerShell
      title="Clients"
      subtitle="Client alerts feed from ShieldHer records."
    >
      <section className={styles.panel}>
        <h3 className={styles.panelTitle}>Clients</h3>
        {error ? (
          <div className={styles.placeholder}>{error}</div>
        ) : loading ? (
          <div className={styles.placeholder}>Loading client alerts...</div>
        ) : selectedClients.length === 0 ? (
          <div className={styles.placeholder}>
            No users have selected you as their lawyer yet.
          </div>
        ) : emergencyAlerts.length === 0 ? (
          <div className={styles.placeholder}>
            Your selected clients currently have no active alerts.
          </div>
        ) : (
          <div className={styles.list}>
            {emergencyAlerts.slice(0, 30).map((alert) => (
              <article key={alert.id} className={styles.listItem}>
                <div className={styles.listItemHead}>
                  <p className={styles.primary}>
                    {alert.client_name} - {alert.location}
                  </p>
                  <p className={styles.secondary}>{new Date(alert.time).toLocaleString('en-US')}</p>
                </div>
                <span className={severityClass(alert.severity)}>{alert.severity}</span>
                <div className={styles.actions}>
                  <button type="button" className={styles.btnPrimary}>
                    Accept Case
                  </button>
                  {alert.upload_id ? (
                    <Link href={`/lawyer/analysis/${alert.upload_id}`} className={styles.btnSecondary}>
                      View Details
                    </Link>
                  ) : (
                    <button type="button" className={`${styles.btnSecondary} ${styles.btnDisabled}`} disabled>
                      View Details
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </LawyerShell>
  );
}
