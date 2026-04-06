'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Upload,
  LineChart,
  ShieldCheck,
  Flag,
  Plus,
  Search,
  Bell,
  CircleHelp,
  ChevronRight,
  AlertTriangle,
  Info,
  Lightbulb,
  Scale,
} from 'lucide-react';
import { type AnalysisResult, type RiskLevel, type Upload as UploadType } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

type UserRole = 'user' | 'lawyer';

type MonthPoint = {
  key: string;
  label: string;
  uploads: number;
  safe: number;
  reviewed: number;
};

type StatusMeta = {
  label: string;
  toneClass: string;
};

function parseRole(value: unknown): UserRole | null {
  if (value === 'lawyer' || value === 'user') return value;
  return null;
}

function shortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function relativeUpdated(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const deltaMins = Math.max(1, Math.round((now - then) / 60000));
  if (deltaMins < 60) return `${deltaMins} min ago`;
  const deltaHours = Math.round(deltaMins / 60);
  if (deltaHours < 24) return `${deltaHours} hr ago`;
  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays} day${deltaDays === 1 ? '' : 's'} ago`;
}

function deltaPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '±';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

function statusMeta(risk: RiskLevel): StatusMeta {
  if (risk === 'safe' || risk === 'low') {
    return { label: 'Cleared', toneClass: styles.statusSafe };
  }

  if (risk === 'medium') {
    return { label: 'Review', toneClass: styles.statusWarn };
  }

  return { label: 'Urgent Review', toneClass: styles.statusDanger };
}

export default function DashboardPage() {
  const router = useRouter();

  const [userName, setUserName] = useState('');
  const [uploads, setUploads] = useState<UploadType[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const role = parseRole(user.user_metadata?.role);
      if (role === 'lawyer') {
        router.replace('/lawyer/dashboard');
        setLoading(false);
        return;
      }

      setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || 'User');

      const [{ data: uploadsData }, { data: analysesData }] = await Promise.all([
        supabase
          .from('uploads')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(120),
        supabase
          .from('analysis_results')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(60),
      ]);

      if (uploadsData) setUploads(uploadsData);
      if (analysesData) setAnalyses(analysesData);

      setLoading(false);
    }

    void fetchData();
  }, [router]);

  const totalUploads = uploads.length;
  const analyzedCount = uploads.filter((u) => u.status === 'completed' || u.status === 'flagged').length;
  const analyzedPercent = totalUploads > 0 ? (analyzedCount / totalUploads) * 100 : 0;
  const flaggedCount = uploads.filter((u) => u.status === 'flagged').length;
  const safeCount = analyses.filter((a) => a.risk_level === 'safe' || a.risk_level === 'low').length;

  const monthSeries = useMemo<MonthPoint[]>(() => {
    const months: MonthPoint[] = [];
    const now = new Date();
    now.setDate(1);

    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setMonth(now.getMonth() - i);

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        label: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        uploads: 0,
        safe: 0,
        reviewed: 0,
      });
    }

    const monthMap = new Map(months.map((point) => [point.key, point]));

    uploads.forEach((upload) => {
      const date = new Date(upload.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const point = monthMap.get(key);
      if (point) point.uploads += 1;
    });

    analyses.forEach((analysis) => {
      const date = new Date(analysis.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const point = monthMap.get(key);
      if (!point) return;

      if (analysis.risk_level === 'safe' || analysis.risk_level === 'low') {
        point.safe += 1;
      } else {
        point.reviewed += 1;
      }
    });

    return months;
  }, [uploads, analyses]);

  const maxBarValue = useMemo(() => {
    const highest = Math.max(
      1,
      ...monthSeries.map((point) => Math.max(point.uploads, point.safe + point.reviewed, point.safe))
    );
    return highest;
  }, [monthSeries]);

  const monthNow = monthSeries[monthSeries.length - 1] ?? { uploads: 0, safe: 0, reviewed: 0 };
  const monthPrev = monthSeries[monthSeries.length - 2] ?? { uploads: 0, safe: 0, reviewed: 0 };

  const uploadsDelta = deltaPercent(monthNow.uploads, monthPrev.uploads);
  const analyzedDelta = deltaPercent(monthNow.safe + monthNow.reviewed, monthPrev.safe + monthPrev.reviewed);
  const safeDelta = deltaPercent(monthNow.safe, monthPrev.safe);
  const flaggedDelta = deltaPercent(monthNow.reviewed, monthPrev.reviewed);

  const healthScore = useMemo(() => {
    if (analyses.length === 0) return 75;

    const scoreMap: Record<RiskLevel, number> = {
      safe: 100,
      low: 82,
      medium: 58,
      high: 32,
      critical: 14,
    };

    const total = analyses.reduce((sum, analysis) => sum + scoreMap[analysis.risk_level], 0);
    const avg = Math.round(total / analyses.length);
    return Math.max(5, Math.min(99, avg));
  }, [analyses]);

  const gaugeRadius = 88;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference * (1 - healthScore / 100);

  const regionsProtected = Math.max(1, Math.ceil((safeCount + analyzedCount) / 3));

  const visibleAnalyses = analyses.slice(0, 5);
  const expandedAnalysis = analyses.find((analysis) => analysis.id === expandedId) ?? null;

  const toggleRow = (id: string) => {
    setExpandedId((curr) => (curr === id ? null : id));
  };

  const userInitial = userName.trim().charAt(0).toUpperCase() || 'U';

  return (
    <div className={styles.page}>
      <header className={styles.topNav}>
        <div className={styles.searchWrap}>
          <Search size={18} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search safety reports..."
            aria-label="Search dashboard reports"
          />
        </div>

        <div className={styles.navActions}>
          <button className={styles.iconButton} aria-label="Notifications">
            <Bell size={18} />
            <span className={styles.notificationDot} />
          </button>
          <button className={styles.iconButton} aria-label="Help">
            <CircleHelp size={18} />
          </button>

          <div className={styles.profileChip}>
            <div className={styles.profileMeta}>
              <p className={styles.profileName}>{loading ? '...' : userName}</p>
              <p className={styles.profileRole}>Safety Lead</p>
            </div>
            <div className={styles.profileAvatar}>{userInitial}</div>
          </div>
        </div>
      </header>

      <section className={styles.headingRow}>
        <div className={styles.pageTitleBlock}>
          <h1 className={styles.pageTitle}>Safety Dashboard</h1>
          <p className={styles.pageSubtitle}>
            Monitoring and analyzing visual content patterns to protect your evidence quality,
            detect risk, and keep your safety workflow compliant.
          </p>
        </div>

        <Link href="/dashboard/upload" className={styles.newAnalysisBtn}>
          <Plus size={16} />
          <span>New Analysis</span>
        </Link>
      </section>

      <section className={styles.metricGrid}>
        <article className={styles.metricCard}>
          <div className={styles.metricTop}>
            <div className={styles.metricIconWrap}>
              <Upload size={18} />
            </div>
            <span className={`${styles.metricTrend} ${uploadsDelta >= 0 ? styles.trendUp : styles.trendDown}`}>
              {formatDelta(uploadsDelta)}
            </span>
          </div>
          <p className={styles.metricLabel}>Total Uploads</p>
          <p className={styles.metricValue}>{totalUploads.toLocaleString()}</p>
        </article>

        <article className={styles.metricCard}>
          <div className={styles.metricTop}>
            <div className={styles.metricIconWrap}>
              <LineChart size={18} />
            </div>
            <span className={`${styles.metricTrend} ${analyzedDelta >= 0 ? styles.trendUp : styles.trendDown}`}>
              {formatDelta(analyzedDelta)}
            </span>
          </div>
          <p className={styles.metricLabel}>Analyzed Rate</p>
          <p className={styles.metricValue}>{analyzedPercent.toFixed(1)}%</p>
        </article>

        <article className={styles.metricCard}>
          <div className={styles.metricTop}>
            <div className={styles.metricIconWrap}>
              <ShieldCheck size={18} />
            </div>
            <span className={`${styles.metricTrend} ${safeDelta >= 0 ? styles.trendUp : styles.trendDown}`}>
              {formatDelta(safeDelta)}
            </span>
          </div>
          <p className={styles.metricLabel}>Safe Results</p>
          <p className={styles.metricValue}>{safeCount.toLocaleString()}</p>
        </article>

        <article className={styles.metricCard}>
          <div className={styles.metricTop}>
            <div className={styles.metricIconWrap}>
              <Flag size={18} />
            </div>
            <span className={`${styles.metricTrend} ${flaggedDelta <= 0 ? styles.trendUp : styles.trendDown}`}>
              {formatDelta(flaggedDelta)}
            </span>
          </div>
          <p className={styles.metricLabel}>Flagged Assets</p>
          <p className={styles.metricValue}>{flaggedCount.toLocaleString()}</p>
        </article>
      </section>

      <section className={styles.analyticsGrid}>
        <article className={styles.barPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h2 className={styles.panelTitle}>Safety Insights</h2>
              <p className={styles.panelHint}>Activity over the last 12 months</p>
            </div>
            <div className={styles.rangeSwitch}>
              <button className={styles.rangeActive}>Monthly</button>
              <button>Yearly</button>
            </div>
          </div>

          <div className={styles.barChart}>
            {monthSeries.map((point) => {
              const mutedHeight = Math.max(8, (point.uploads / maxBarValue) * 100);
              const primaryHeight = Math.max(8, (point.safe / maxBarValue) * 100);

              return (
                <div key={point.key} className={styles.barGroup}>
                  <div className={styles.barPair}>
                    <div className={styles.barMuted} style={{ height: `${mutedHeight}%` }} />
                    <div className={styles.barPrimary} style={{ height: `${primaryHeight}%` }} />
                  </div>
                  <span className={styles.monthLabel}>{point.label}</span>
                </div>
              );
            })}
          </div>
        </article>

        <article className={styles.gaugePanel}>
          <h2 className={styles.gaugeTitle}>Global Safety Index</h2>

          <div className={styles.gaugeWrap}>
            <svg className={styles.gaugeSvg} viewBox="0 0 220 220" aria-hidden="true">
              <circle className={styles.gaugeTrack} cx="110" cy="110" r={gaugeRadius} />
              <circle
                className={styles.gaugeProgress}
                cx="110"
                cy="110"
                r={gaugeRadius}
                style={{
                  strokeDasharray: gaugeCircumference,
                  strokeDashoffset: gaugeOffset,
                }}
              />
            </svg>

            <div className={styles.gaugeCenter}>
              <p className={styles.gaugeValue}>{healthScore}%</p>
              <p className={styles.gaugeMeta}>Health Score</p>
            </div>
          </div>

          <p className={styles.gaugeSummary}>
            Protocols integrated in <strong>{regionsProtected} regions</strong>
          </p>

          <div className={styles.gaugeProgressTrack}>
            <div className={styles.gaugeProgressFill} style={{ width: `${healthScore}%` }} />
          </div>

          <p className={styles.gaugeCaption}>Quarterly progress</p>
        </article>
      </section>

      <section className={styles.tablePanel}>
        <div className={styles.tableHeader}>
          <div>
            <h2 className={styles.tableTitle}>Recent Analyses</h2>
            <p className={styles.tableMeta}>
              Last updated {visibleAnalyses[0] ? relativeUpdated(visibleAnalyses[0].created_at) : 'just now'}
            </p>
          </div>

          <Link href="/dashboard/history" className={styles.tableAction}>
            View Archive
          </Link>
        </div>

        {visibleAnalyses.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.analysesTable}>
              <thead>
                <tr>
                  <th>Analysis ID</th>
                  <th>Date</th>
                  <th>Pattern Found</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th className={styles.rightAlign}>Confidence</th>
                  <th className={styles.rightAlign}>Details</th>
                </tr>
              </thead>
              <tbody>
                {visibleAnalyses.map((analysis) => {
                  const firstFlag = analysis.flags?.[0];
                  const status = statusMeta(analysis.risk_level);
                  const confidence = analysis.details?.confidence_score ?? 0;

                  return (
                    <tr key={analysis.id} onClick={() => toggleRow(analysis.id)}>
                      <td className={styles.analysisId}>#ANL-{analysis.upload_id.slice(0, 4).toUpperCase()}</td>
                      <td>{shortDate(analysis.created_at)}</td>
                      <td>{firstFlag?.description || analysis.summary}</td>
                      <td>
                        <span className={styles.categoryTag}>{firstFlag?.category || 'General Scan'}</span>
                      </td>
                      <td>
                        <span className={`${styles.statusBadge} ${status.toneClass}`}>
                          <span className={styles.statusDot} />
                          {status.label}
                        </span>
                      </td>
                      <td className={`${styles.rightAlign} ${styles.confidence}`}>
                        {confidence > 0 ? `${confidence}%` : '—'}
                      </td>
                      <td className={styles.rightAlign}>
                        <button
                          className={styles.rowToggle}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleRow(analysis.id);
                          }}
                          aria-label="Toggle analysis details"
                        >
                          <ChevronRight
                            size={16}
                            className={`${styles.rowToggleIcon} ${expandedId === analysis.id ? styles.rowToggleOpen : ''}`}
                          />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <Upload size={34} />
            <h3>No analyses yet</h3>
            <p>Upload your first screenshot to start generating safety insights.</p>
            <Link href="/dashboard/upload" className={styles.newAnalysisBtn}>
              <Plus size={16} />
              <span>Upload Screenshot</span>
            </Link>
          </div>
        )}
      </section>

      {expandedAnalysis ? (
        <section className={styles.detailsDrawer}>
          <h3 className={styles.detailsHeading}>
            Analysis Details: #ANL-{expandedAnalysis.upload_id.slice(0, 4).toUpperCase()}
          </h3>

          <div className={styles.detailsGrid}>
            {expandedAnalysis.flags?.length ? (
              <article className={styles.detailsCard}>
                <h4 className={styles.detailsCardTitle}>
                  <AlertTriangle size={14} />
                  Detected Flags
                </h4>
                <ul className={styles.detailsList}>
                  {expandedAnalysis.flags.map((flag, index) => (
                    <li key={`${flag.category}-${index}`}>
                      <strong>{flag.category}:</strong> {flag.description}
                    </li>
                  ))}
                </ul>
              </article>
            ) : null}

            {expandedAnalysis.details?.recommendations?.length ? (
              <article className={styles.detailsCard}>
                <h4 className={styles.detailsCardTitle}>
                  <Lightbulb size={14} />
                  Recommendations
                </h4>
                <ul className={styles.detailsList}>
                  {expandedAnalysis.details.recommendations.map((rec, index) => (
                    <li key={`${rec}-${index}`}>{rec}</li>
                  ))}
                </ul>
              </article>
            ) : null}

            {expandedAnalysis.details?.legal_analysis ? (
              <article className={styles.detailsCard}>
                <h4 className={styles.detailsCardTitle}>
                  <Scale size={14} />
                  Legal Perspective
                </h4>
                <p className={styles.detailsText}>{expandedAnalysis.details.legal_analysis.summary}</p>
              </article>
            ) : null}

            {!expandedAnalysis.flags?.length &&
            !expandedAnalysis.details?.recommendations?.length &&
            !expandedAnalysis.details?.legal_analysis ? (
              <article className={styles.detailsCard}>
                <h4 className={styles.detailsCardTitle}>
                  <Info size={14} />
                  Summary
                </h4>
                <p className={styles.detailsText}>{expandedAnalysis.summary}</p>
              </article>
            ) : null}
          </div>

          <Link href={`/dashboard/analysis/${expandedAnalysis.upload_id}`} className={styles.reportLink}>
            Generate PDF Report
            <ChevronRight size={14} />
          </Link>
        </section>
      ) : null}
    </div>
  );
}
