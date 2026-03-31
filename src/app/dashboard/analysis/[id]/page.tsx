"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Upload, type AnalysisResult, type AnalysisFlag, type RiskLevel } from "@/lib/types";
import { retrieveKey, decryptText, decryptFile } from "@/lib/crypto";
import type { EncryptedPayload } from "@/lib/crypto";
import RiskBadge from "@/components/RiskBadge";
import LoadingSpinner from "@/components/LoadingSpinner";
import Link from "next/link";
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
  Lock,
} from "lucide-react";
import styles from "./page.module.css";

interface DecryptedAnalysis {
  risk_level: RiskLevel;
  summary: string;
  flags: AnalysisFlag[];
  details: {
    tone_analysis?: string;
    manipulation_indicators?: string[];
    threat_indicators?: string[];
    recommendations?: string[];
    confidence_score?: number;
    legal_analysis?: {
      summary: string;
      potential_violations: string[];
      disclaimer: string;
    };
  };
  created_at: string;
  id: string;
}

export default function AnalysisDetailPage() {
  const params = useParams();
  const uploadId = params.id as string;
  const [upload, setUpload] = useState<Upload | null>(null);
  const [analysis, setAnalysis] = useState<DecryptedAnalysis | null>(null);
  const [decryptedImageUrl, setDecryptedImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    async function fetchAndDecrypt() {
      const supabase = createClient();
      const encryptionKey = await retrieveKey();

      // Fetch upload record
      const { data: uploadData } = await supabase
        .from("uploads")
        .select("*")
        .eq("id", uploadId)
        .single();

      if (uploadData) setUpload(uploadData);

      // Fetch analysis record
      const { data: analysisData } = await supabase
        .from("analysis_results")
        .select("*")
        .eq("upload_id", uploadId)
        .single();

      if (analysisData && encryptionKey) {
        try {
          // Decrypt the analysis fields
          let decryptedSummary = analysisData.summary || '';
          let decryptedFlags: AnalysisFlag[] = analysisData.flags || [];
          let decryptedDetails = analysisData.details || {};

          if (analysisData.encrypted_summary) {
            const summPayload: EncryptedPayload = JSON.parse(analysisData.encrypted_summary);
            decryptedSummary = await decryptText(encryptionKey, summPayload);
          }

          if (analysisData.encrypted_flags) {
            const flagsPayload: EncryptedPayload = JSON.parse(analysisData.encrypted_flags);
            const flagsJson = await decryptText(encryptionKey, flagsPayload);
            decryptedFlags = JSON.parse(flagsJson);
          }

          if (analysisData.encrypted_details) {
            const detailsPayload: EncryptedPayload = JSON.parse(analysisData.encrypted_details);
            const detailsJson = await decryptText(encryptionKey, detailsPayload);
            decryptedDetails = JSON.parse(detailsJson);
          }

          setAnalysis({
            id: analysisData.id,
            risk_level: analysisData.risk_level,
            summary: decryptedSummary,
            flags: decryptedFlags,
            details: decryptedDetails,
            created_at: analysisData.created_at,
          });
        } catch {
          // Fallback: use legacy plaintext if decryption fails (old data)
          setAnalysis({
            id: analysisData.id,
            risk_level: analysisData.risk_level,
            summary: analysisData.summary,
            flags: analysisData.flags || [],
            details: analysisData.details || {},
            created_at: analysisData.created_at,
          });
        }

        // Decrypt the image if it's encrypted
        if (uploadData?.file_iv && encryptionKey) {
          try {
            const imageRes = await fetch(uploadData.file_url);
            const encryptedBuffer = await imageRes.arrayBuffer();
            const decryptedBlob = await decryptFile(
              encryptionKey,
              encryptedBuffer,
              uploadData.file_iv,
              uploadData.original_type || 'image/png'
            );
            const objectUrl = URL.createObjectURL(decryptedBlob);
            setDecryptedImageUrl(objectUrl);
          } catch {
            // If decryption fails, try showing the URL directly (old unencrypted data)
            setDecryptedImageUrl(uploadData.file_url);
          }
        } else if (uploadData) {
          // Legacy: unencrypted image
          setDecryptedImageUrl(uploadData.file_url);
        }
      } else if (analysisData) {
        // No encryption key — show legacy plaintext
        setAnalysis({
          id: analysisData.id,
          risk_level: analysisData.risk_level,
          summary: analysisData.summary,
          flags: analysisData.flags || [],
          details: analysisData.details || {},
          created_at: analysisData.created_at,
        });
        if (uploadData) {
          setDecryptedImageUrl(uploadData.file_url);
        }
      }

      setLoading(false);
    }
    fetchAndDecrypt();
  }, [uploadId]);

  // Client-side PDF generation using jsPDF
  const handleExportPDF = useCallback(async () => {
    if (!analysis || !upload || generating) return;
    setGenerating(true);
    setGenerated(false);

    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      const contentWidth = pageWidth - margin * 2;
      let y = 20;

      const addPageIfNeeded = (requiredSpace: number) => {
        if (y + requiredSpace > 270) {
          doc.addPage();
          y = 20;
        }
      };

      const addWrappedText = (text: string, x: number, startY: number, maxWidth: number, lineHeight: number): number => {
        const lines = doc.splitTextToSize(text, maxWidth);
        for (let i = 0; i < lines.length; i++) {
          addPageIfNeeded(lineHeight);
          doc.text(lines[i], x, startY + i * lineHeight);
        }
        return startY + lines.length * lineHeight;
      };

      // ═══ HEADER ═══
      doc.setFillColor(10, 37, 64);
      doc.rect(0, 0, pageWidth, 40, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('ShieldHer', margin, 18);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('AI-Powered Evidence Report • End-to-End Encrypted', margin, 26);

      const dateStr = new Date().toLocaleString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
      doc.setFontSize(9);
      doc.text(`Generated: ${dateStr}`, margin, 34);
      doc.text(`Report ID: ${analysis.id.substring(0, 8).toUpperCase()}`, pageWidth - margin, 34, { align: 'right' });
      y = 50;

      // ═══ EVIDENCE CALLOUT ═══
      doc.setFillColor(99, 91, 255);
      doc.roundedRect(margin, y, contentWidth, 18, 3, 3, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('This report can be used as supporting evidence when consulting a', margin + 6, y + 7);
      doc.text('lawyer, counselor, or filing a complaint with the authorities.', margin + 6, y + 13);
      y += 26;

      // ═══ RISK LEVEL ═══
      doc.setTextColor(10, 37, 64);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Risk Assessment', margin, y);
      y += 8;

      const riskColors: Record<string, [number, number, number]> = {
        safe: [0, 212, 170], low: [59, 130, 246], medium: [245, 158, 11],
        high: [239, 68, 68], critical: [220, 38, 38],
      };
      const riskLabels: Record<string, string> = {
        safe: 'SAFE', low: 'LOW RISK', medium: 'MEDIUM RISK',
        high: 'HIGH RISK', critical: 'CRITICAL',
      };

      const riskColor = riskColors[analysis.risk_level] || [100, 100, 100];
      doc.setFillColor(...riskColor);
      doc.roundedRect(margin, y, 40, 8, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(riskLabels[analysis.risk_level] || analysis.risk_level.toUpperCase(), margin + 20, y + 5.5, { align: 'center' });
      y += 16;

      // ═══ FILE INFO ═══
      doc.setTextColor(66, 84, 102);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`File: ${upload.file_name}`, margin, y);
      y += 5;
      doc.text(`Analyzed: ${new Date(analysis.created_at).toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`, margin, y);
      y += 10;

      // ═══ SUMMARY ═══
      doc.setTextColor(10, 37, 64);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('Analysis Summary', margin, y);
      y += 7;
      doc.setTextColor(66, 84, 102);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      y = addWrappedText(analysis.summary || 'No summary available.', margin, y, contentWidth, 5);
      y += 8;

      // ═══ FLAGS ═══
      const flags = analysis.flags || [];
      if (flags.length > 0) {
        addPageIfNeeded(20);
        doc.setTextColor(10, 37, 64);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(`Detected Flags (${flags.length})`, margin, y);
        y += 8;
        for (const flag of flags) {
          addPageIfNeeded(25);
          const flagColor = riskColors[flag.severity] || [100, 100, 100];
          doc.setFillColor(...flagColor);
          doc.roundedRect(margin, y, 28, 6, 1.5, 1.5, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(7);
          doc.setFont('helvetica', 'bold');
          doc.text((flag.severity || '').toUpperCase(), margin + 14, y + 4.2, { align: 'center' });
          doc.setTextColor(10, 37, 64);
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text(flag.category || '', margin + 32, y + 4.5);
          y += 9;
          doc.setTextColor(66, 84, 102);
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          if (flag.description) {
            y = addWrappedText(flag.description, margin + 4, y, contentWidth - 4, 4.5);
            y += 2;
          }
          if (flag.evidence) {
            doc.setFillColor(237, 241, 247);
            const evidenceLines = doc.splitTextToSize(`"${flag.evidence}"`, contentWidth - 12);
            const evidenceHeight = evidenceLines.length * 4.5 + 4;
            addPageIfNeeded(evidenceHeight);
            doc.roundedRect(margin + 4, y, contentWidth - 8, evidenceHeight, 1.5, 1.5, 'F');
            doc.setTextColor(136, 152, 170);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            for (let i = 0; i < evidenceLines.length; i++) {
              doc.text(evidenceLines[i], margin + 8, y + 4 + i * 4.5);
            }
            y += evidenceHeight + 4;
          }
          y += 2;
        }
        y += 4;
      }

      // ═══ DETAILS ═══
      const details = analysis.details || {};

      if (details.tone_analysis) {
        addPageIfNeeded(20);
        doc.setTextColor(10, 37, 64);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Tone Analysis', margin, y);
        y += 7;
        doc.setTextColor(66, 84, 102);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        y = addWrappedText(details.tone_analysis, margin, y, contentWidth, 5);
        y += 8;
      }

      if (details.manipulation_indicators && details.manipulation_indicators.length > 0) {
        addPageIfNeeded(20);
        doc.setTextColor(10, 37, 64);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Manipulation Indicators', margin, y);
        y += 7;
        doc.setTextColor(66, 84, 102);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        for (const indicator of details.manipulation_indicators) {
          addPageIfNeeded(6);
          doc.text(`• ${indicator}`, margin + 4, y);
          y += 5;
        }
        y += 4;
      }

      if (details.recommendations && details.recommendations.length > 0) {
        addPageIfNeeded(20);
        doc.setTextColor(10, 37, 64);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Recommendations', margin, y);
        y += 7;
        doc.setTextColor(66, 84, 102);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        for (const rec of details.recommendations) {
          addPageIfNeeded(10);
          const recLines = doc.splitTextToSize(`✓ ${rec}`, contentWidth - 4);
          for (let i = 0; i < recLines.length; i++) {
            addPageIfNeeded(5);
            doc.text(recLines[i], margin + 4, y + i * 4.5);
          }
          y += recLines.length * 4.5 + 2;
        }
        y += 4;
      }

      if (details.legal_analysis) {
        addPageIfNeeded(25);
        doc.setTextColor(10, 37, 64);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('Preliminary Legal Analysis', margin, y);
        y += 7;
        doc.setTextColor(66, 84, 102);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        if (details.legal_analysis.summary) {
          y = addWrappedText(details.legal_analysis.summary, margin, y, contentWidth, 5);
          y += 5;
        }
        if (details.legal_analysis.potential_violations && details.legal_analysis.potential_violations.length > 0) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'bold');
          doc.text('Potential Violations:', margin, y);
          y += 6;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          for (const violation of details.legal_analysis.potential_violations) {
            addPageIfNeeded(6);
            doc.text(`• ${violation}`, margin + 4, y);
            y += 5;
          }
          y += 4;
        }
        if (details.legal_analysis.disclaimer) {
          addPageIfNeeded(20);
          doc.setFillColor(254, 242, 242);
          doc.setDrawColor(239, 68, 68);
          const disclaimerLines = doc.splitTextToSize(details.legal_analysis.disclaimer, contentWidth - 16);
          const disclaimerHeight = disclaimerLines.length * 4.5 + 8;
          doc.roundedRect(margin, y, contentWidth, disclaimerHeight, 2, 2, 'FD');
          doc.setTextColor(180, 40, 40);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text('⚠ LEGAL DISCLAIMER', margin + 6, y + 5);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          for (let i = 0; i < disclaimerLines.length; i++) {
            doc.text(disclaimerLines[i], margin + 6, y + 10 + i * 4.5);
          }
          y += disclaimerHeight + 8;
        }
      }

      // ═══ FOOTER ═══
      addPageIfNeeded(20);
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
      doc.setTextColor(136, 152, 170);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('This report was generated by ShieldHer — AI-Powered Women\'s Safety Platform', margin, y);
      y += 4;
      doc.text('© ' + new Date().getFullYear() + ' ShieldHer. End-to-End Encrypted. This document is confidential.', margin, y);

      // Download the PDF
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ShieldHer-Report-${analysis.id.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setGenerated(true);
      setTimeout(() => setGenerated(false), 4000);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to generate report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }, [analysis, upload, generating]);

  // Cleanup decrypted image URL on unmount
  useEffect(() => {
    return () => {
      if (decryptedImageUrl && decryptedImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(decryptedImageUrl);
      }
    };
  }, [decryptedImageUrl]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <LoadingSpinner text="Decrypting analysis..." />
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
                {new Date(analysis.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className={styles.dot}>•</span>
              <Lock size={13} />
              <span>End-to-End Encrypted</span>
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
              <h3 className={styles.exportBannerTitle}>
                Export as Evidence PDF
              </h3>
              <p className={styles.exportBannerDesc}>
                Generate a certified evidence report that{" "}
                <strong>can be used as supporting evidence</strong> when
                consulting a lawyer, counselor, or filing a complaint with the
                authorities. PDF is generated locally in your browser.
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
          {decryptedImageUrl ? (
            <img
              src={decryptedImageUrl}
              alt="Chat screenshot"
              className={styles.screenshot}
            />
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Lock size={32} />
              <p>Unable to decrypt image. Please log in again.</p>
            </div>
          )}
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
      {details.manipulation_indicators &&
        details.manipulation_indicators.length > 0 && (
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
          <div className={`${styles.detailCard} ${styles.legalCard}`}>
            <p className={styles.legalSummary}>
              {details.legal_analysis.summary}
            </p>

            {details.legal_analysis.potential_violations &&
              details.legal_analysis.potential_violations.length > 0 && (
                <div className={styles.legalViolations}>
                  <strong className={styles.legalViolationsTitle}>
                    Potential Violations:
                  </strong>
                  <ul className={styles.indicatorList}>
                    {details.legal_analysis.potential_violations.map(
                      (violation, i) => (
                        <li key={i}>{violation}</li>
                      ),
                    )}
                  </ul>
                </div>
              )}

            <div className={styles.legalDisclaimer}>
              <AlertTriangle size={16} className={styles.legalDisclaimerIcon} />
              <p className={styles.legalDisclaimerText}>
                <strong>Disclaimer:</strong> {details.legal_analysis.disclaimer}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
