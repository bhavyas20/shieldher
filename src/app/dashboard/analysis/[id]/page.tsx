'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { type Upload, type AnalysisResult } from '@/lib/types';
import RiskBadge from '@/components/RiskBadge';
import LoadingSpinner from '@/components/LoadingSpinner';
import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Brain,
  Target,
  MessageSquare,
  Lightbulb,
  Scale,
  FileDown,
  Loader,
  CheckCircle,
} from 'lucide-react';
import styles from './page.module.css';

export default function AnalysisDetailPage() {
  const params = useParams();
  const uploadId = params.id as string;
  const [upload, setUpload] = useState<Upload | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      const { data: uploadData } = await supabase
        .from('uploads')
        .select('*')
        .eq('id', uploadId)
        .single();

      if (uploadData) setUpload(uploadData);

      const { data: analysisData } = await supabase
        .from('analysis_results')
        .select('*')
        .eq('upload_id', uploadId)
        .single();

      if (analysisData) setAnalysis(analysisData);
      setLoading(false);
    }
    fetchData();
  }, [uploadId]);

  const handleExportPDF = async () => {
    if (!uploadId || generating) return;
    setGenerating(true);
    setGenerated(false);

    try {
      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate report');
      }

      // Download the PDF
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ShieldHer-Report-${analysis?.id?.substring(0, 8) || 'report'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setGenerated(true);

      setTimeout(() => setGenerated(false), 4000);
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to generate report. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <LoadingSpinner text="Loading analysis..." />
        </div>
      </div>
    );
  }

  if (!analysis || !upload) {
    return (
      <div className={styles.page}>
        <div className={styles.empty}>
          <h3>Analysis not found</h3>
          <Link href="/dashboard/history" className="btn btn-secondary">
            Back to History
          </Link>
        </div>
      </div>
    );
  }

  const details = analysis.details || {};

  return (
    <div className={styles.page}>
      <Link href="/dashboard/history" className={styles.back}>
        <ArrowLeft size={16} />
        Back to History
      </Link>

      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.title}>Analysis Report</h1>
            <div className={styles.meta}>
              <span>{upload.file_name}</span>
              <span className={styles.dot}>•</span>
              <Clock size={13} />
              <span>
                {new Date(analysis.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
          <RiskBadge level={analysis.risk_level} size="lg" />
        </div>
      </div>

      {/* ═══ PROMINENT EXPORT BUTTON ═══ */}
      <div className={styles.exportBanner}>
        <div className={styles.exportBannerContent}>
          <div className={styles.exportBannerText}>
            <FileDown size={22} className={styles.exportBannerIcon} />
            <div>
              <h3 className={styles.exportBannerTitle}>Export as Evidence PDF</h3>
              <p className={styles.exportBannerDesc}>
                Generate a certified evidence report that <strong>can be used as supporting evidence</strong> when 
                consulting a lawyer, counselor, or filing a complaint with the authorities.
              </p>
            </div>
          </div>
          <button
            className={styles.exportBtn}
            onClick={handleExportPDF}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader size={18} className="animate-spin" />
                Generating...
              </>
            ) : generated ? (
              <>
                <CheckCircle size={18} />
                Downloaded!
              </>
            ) : (
              <>
                <FileDown size={18} />
                Download PDF Report
              </>
            )}
          </button>
        </div>
      </div>

      {/* Screenshot preview */}
      <div className={styles.screenshotSection}>
        <h2 className={styles.sectionTitle}>
          <Target size={18} />
          Uploaded Screenshot
        </h2>
        <div className={styles.screenshotWrap}>
          <img src={upload.file_url} alt="Chat screenshot" className={styles.screenshot} />
        </div>
      </div>

      {/* Summary */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <Brain size={18} />
          Analysis Summary
        </h2>
        <div className={styles.summaryCard}>
          <p>{analysis.summary}</p>
          {details.confidence_score !== undefined && (
            <div className={styles.confidence}>
              <span>Confidence:</span>
              <div className={styles.confidenceBar}>
                <div
                  className={styles.confidenceFill}
                  style={{ width: `${details.confidence_score}%` }}
                />
              </div>
              <span>{details.confidence_score}%</span>
            </div>
          )}
        </div>
      </div>

      {/* Flags */}
      {analysis.flags && analysis.flags.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <AlertTriangle size={18} />
            Detected Flags ({analysis.flags.length})
          </h2>
          <div className={styles.flagGrid}>
            {analysis.flags.map((flag, i) => (
              <div key={i} className={styles.flagCard}>
                <div className={styles.flagHeader}>
                  <RiskBadge level={flag.severity} size="sm" />
                  <span className={styles.flagCategory}>{flag.category}</span>
                </div>
                <p className={styles.flagDesc}>{flag.description}</p>
                {flag.evidence && (
                  <div className={styles.evidence}>
                    <MessageSquare size={13} />
                    <span>&ldquo;{flag.evidence}&rdquo;</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tone Analysis */}
      {details.tone_analysis && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <MessageSquare size={18} />
            Tone Analysis
          </h2>
          <div className={styles.detailCard}>
            <p>{details.tone_analysis}</p>
          </div>
        </div>
      )}

      {/* Manipulation Indicators */}
      {details.manipulation_indicators && details.manipulation_indicators.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <AlertTriangle size={18} />
            Manipulation Indicators
          </h2>
          <ul className={styles.indicatorList}>
            {details.manipulation_indicators.map((ind, i) => (
              <li key={i}>{ind}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {details.recommendations && details.recommendations.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Lightbulb size={18} />
            Recommendations
          </h2>
          <ul className={styles.recList}>
            {details.recommendations.map((rec, i) => (
              <li key={i}>
                <ShieldCheck size={14} />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Legal Analysis */}
      {details.legal_analysis && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <Scale size={18} />
            Preliminary Legal Analysis
          </h2>
          <div className={styles.detailCard} style={{ borderLeft: '3px solid var(--accent)', background: 'linear-gradient(to right, rgba(217, 70, 239, 0.05), transparent)' }}>
            <p style={{ fontWeight: 500, marginBottom: '1rem' }}>{details.legal_analysis.summary}</p>
            {details.legal_analysis.potential_violations && details.legal_analysis.potential_violations.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Potential Violations:</strong>
                <ul className={styles.indicatorList}>
                  {details.legal_analysis.potential_violations.map((violation, i) => (
                    <li key={i}>{violation}</li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 'var(--radius)', color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <AlertTriangle size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: '2px' }} />
              <p style={{ margin: 0 }}>
                <strong>Disclaimer:</strong> {details.legal_analysis.disclaimer}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
