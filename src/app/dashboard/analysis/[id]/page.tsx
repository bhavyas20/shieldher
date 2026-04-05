"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Upload, type AnalysisResult, type AnalysisFlag, type RiskLevel } from "@/lib/types";
import { retrieveKey, decryptFile } from "@/lib/crypto";
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
  Bot,
  X,
  MapPin,
  User,
  Mail,
  Phone,
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
    rpa_filing_data?: {
      platform?: string;
      platform_url_or_id?: string | null;
      incident_category?: string;
      approximate_date?: string | null;
      suspect_info?: {
        name?: string;
        identifier_type?: string;
        identifier_value?: string | null;
        description?: string;
      };
    };
  };
  created_at: string;
  id: string;
}

const INDIAN_STATES = [
  'ANDAMAN AND NICOBAR ISLANDS', 'ANDHRA PRADESH', 'ARUNACHAL PRADESH',
  'ASSAM', 'BIHAR', 'CHANDIGARH', 'CHHATTISGARH', 'DELHI', 'GOA', 'GUJARAT',
  'HARYANA', 'HIMACHAL PRADESH', 'JAMMU AND KASHMIR', 'JHARKHAND', 'KARNATAKA',
  'KERALA', 'LADAKH', 'LAKSHADWEEP', 'MADHYA PRADESH', 'MAHARASHTRA', 'MANIPUR',
  'MEGHALAYA', 'MIZORAM', 'NAGALAND', 'ODISHA', 'PUDUCHERRY', 'PUNJAB',
  'RAJASTHAN', 'SIKKIM', 'TAMIL NADU', 'TELANGANA', 'TRIPURA',
  'UTTAR PRADESH', 'UTTARAKHAND', 'WEST BENGAL',
];

const SUSPECT_ID_TYPES = [
  { value: 'none', label: 'Not Available' },
  { value: 'mobile', label: 'Mobile Number' },
  { value: 'email', label: 'Email Address' },
  { value: 'social_media_id', label: 'Social Media ID / Handle' },
  { value: 'username', label: 'Username' },
];

export default function AnalysisDetailPage() {
  const params = useParams();
  const uploadId = params.id as string;
  const [upload, setUpload] = useState<Upload | null>(null);
  const [analysis, setAnalysis] = useState<DecryptedAnalysis | null>(null);
  const [decryptedImageUrl, setDecryptedImageUrl] = useState<string | null>(null);
  const [batchImages, setBatchImages] = useState<Array<{ url: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchForm, setDispatchForm] = useState({
    state: 'DELHI',
    district: '',
    email: '',
    suspectName: '',
    suspectContact: '',
    suspectIdType: 'none',
    incidentDate: '',
    incidentHour: '10',
    incidentMinute: '30',
    incidentAmPm: 'AM',
  });
  const decryptedImageRef = useRef<Blob | null>(null);

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient();

      // 1. Fetch current analysis record to check for batch_id
      const { data: analysisData } = await supabase
        .from("analysis_results")
        .select(`
          *,
          uploads (*)
        `)
        .eq("upload_id", uploadId)
        .single();

      if (analysisData) {
        setAnalysis({
          id: analysisData.id,
          risk_level: analysisData.risk_level,
          summary: analysisData.summary,
          flags: analysisData.flags || [],
          details: analysisData.details || {},
          created_at: analysisData.created_at,
        });

        const key = await retrieveKey();

        // Helper to decrypt image if IV exists
        const loadSecureImage = async (url: string, iv: string | null) => {
          if (!iv || !key) return url; // Fallback to raw if not encrypted or locked
          try {
            const res = await fetch(url);
            if (!res.ok) return url;
            const buf = await res.arrayBuffer();
            const blob = await decryptFile(key, buf, iv, 'image/png');
            return URL.createObjectURL(blob);
          } catch (e) {
            console.error('Failed to decrypt image:', e);
            return url;
          }
        };

        if (analysisData.uploads) {
          setUpload(analysisData.uploads);
          const url = await loadSecureImage(analysisData.uploads.file_url, analysisData.uploads.file_iv);
          setDecryptedImageUrl(url);
        }

        // 2. Check for batch_id and fetch siblings
        const batchId = (analysisData.details as any)?.batch_id;
        if (batchId) {
          const { data: siblingAnalyses } = await supabase
            .from("analysis_results")
            .select(`
              upload_id,
              uploads (file_url, file_name, file_iv)
            `)
            .eq("details->>batch_id", batchId);

          if (siblingAnalyses) {
            const validAnalyses = siblingAnalyses.filter((a: any) => a.uploads);
            const imagePromises = validAnalyses.map(async (a: any) => {
              const secureUrl = await loadSecureImage(a.uploads.file_url, a.uploads.file_iv);
              return { url: secureUrl, name: a.uploads.file_name };
            });
            const images = await Promise.all(imagePromises);
            setBatchImages(images);
          }
        } else if (analysisData.uploads) {
          // If no batchId, the batch is just this one image
          const secureUrl = await loadSecureImage(analysisData.uploads.file_url, analysisData.uploads.file_iv);
          setBatchImages([{ url: secureUrl, name: analysisData.uploads.file_name }]);
        }
      }

      setLoading(false);
    }
    fetchData();
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

  const openDispatchModal = () => {
    // Pre-fill from AI-extracted data
    const rpaData = analysis?.details?.rpa_filing_data;
    const suspectInfo = rpaData?.suspect_info;
    const today = new Date().toISOString().split('T')[0];
    setDispatchForm(prev => ({
      ...prev,
      suspectName: suspectInfo?.name || prev.suspectName || '',
      suspectContact: suspectInfo?.identifier_value || prev.suspectContact || '',
      suspectIdType: suspectInfo?.identifier_type || prev.suspectIdType || 'none',
      incidentDate: rpaData?.approximate_date || prev.incidentDate || today,
    }));
    setShowDispatchModal(true);
  };

  const handleDispatch = async () => {
    setShowDispatchModal(false);
    setDispatching(true);
    try {
      // 1. Fetch and convert ALL images in the batch to base64
      let fetchWarnings: string[] = [];
      const evidenceItems = await Promise.all(
        batchImages.map(async (img) => {
          try {
            const res = await fetch(img.url);
            if (!res.ok) {
              fetchWarnings.push(`Failed to fetch ${img.name}: HTTP ${res.status}`);
              return null;
            }
            const blob = await res.blob();
            if (blob.size === 0) {
              fetchWarnings.push(`Empty image: ${img.name}`);
              return null;
            }
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = reader.result as string;
                resolve(dataUrl.split(',')[1]);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            return {
              base64,
              mime_type: blob.type || "image/png",
            };
          } catch (e) {
            console.error(`Failed to process evidence image: ${img.url}`, e);
            fetchWarnings.push(`Error processing ${img.name}`);
            return null;
          }
        })
      );

      const validEvidence = evidenceItems.filter((item): item is { base64: string; mime_type: string } => item !== null);

      // Show warning if some images failed but still proceed
      if (fetchWarnings.length > 0 && validEvidence.length > 0) {
        console.warn(`Some evidence images could not be fetched: ${fetchWarnings.join(', ')}`);
      }

      const payload = {
        analysis: {
          risk_level: analysis!.risk_level,
          summary: analysis!.summary,
          flags: analysis!.flags,
          details: analysis!.details,
        },
        evidence_items: validEvidence.length > 0 ? validEvidence : undefined, // Send only if we have valid items
        upload_id: uploadId,
        user_state: dispatchForm.state,
        user_district: dispatchForm.district,
        user_email: dispatchForm.email,
        user_suspect_name: dispatchForm.suspectName,
        user_suspect_contact: dispatchForm.suspectContact,
        user_suspect_id_type: dispatchForm.suspectIdType,
        user_incident_date: dispatchForm.incidentDate,
        user_incident_hour: dispatchForm.incidentHour,
        user_incident_minute: dispatchForm.incidentMinute,
        user_incident_ampm: dispatchForm.incidentAmPm,
      };

      const res = await fetch('/api/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch');
      
      let successMsg = `Dispatcher initialized successfully! The RPA bot is filling the complaint form.`;
      if (validEvidence.length > 0) {
        successMsg += ` ${validEvidence.length} evidence screenshot(s) will be attached.`;
      } else {
        successMsg += ` A placeholder evidence file will be used (original images could not be fetched).`;
      }
      if (fetchWarnings.length > 0) {
        successMsg += `\n\nNote: ${fetchWarnings.length} image(s) could not be loaded.`;
      }
      successMsg += `\n\nA browser window will open shortly.`;
      alert(successMsg);
    } catch (err: unknown) {
      alert("Failed to run dispatcher: " + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setDispatching(false);
    }
  };

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
    <>
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

      {/* ═══ AUTONOMOUS DISPATCHER BUTTON ═══ */}
      <div className={styles.dispatcherBanner}>
        <div className={styles.exportBannerContent}>
          <div className={styles.exportBannerText}>
            <Bot size={22} className={styles.dispatcherIcon} />
            <div>
              <h3 className={styles.exportBannerTitle}>
                Autonomous Legal Dispatcher
              </h3>
              <p className={styles.exportBannerDesc}>
                Automatically file a complaint with the appropriate authorities using your local machine.{" "}
                <strong>This will open a browser window and pre-fill the complex legal forms for you.</strong> You will have a chance to review the complaint before submitting.
              </p>
            </div>
          </div>
          <button
            className={styles.dispatcherBtn}
            onClick={openDispatchModal}
            disabled={dispatching}
          >
            {dispatching ? (
              <>
                <Loader size={18} className="animate-spin" />
                Initializing...
              </>
            ) : (
              <>
                <Bot size={18} />
                Run Legal Dispatcher
              </>
            )}
          </button>
        </div>
      </div>

      {/* Screenshot preview */}
      <div className={styles.screenshotSection}>
        <h2 className={styles.sectionTitle}>
          <Target size={18} />
          Uploaded Evidence ({batchImages.length})
        </h2>
        <div className={styles.screenshotGrid}>
          {batchImages.map((img, idx) => (
            <div key={idx} className={styles.screenshotWrap}>
              <img
                src={img.url}
                alt={`Batch screenshot ${idx + 1}`}
                className={styles.screenshot}
              />
            </div>
          ))}
          {batchImages.length === 0 && (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Lock size={32} />
              <p>Unable to decrypt images. Please log in again.</p>
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

    {/* ═══ PRE-DISPATCH MODAL ═══ */}
    {showDispatchModal && (
      <div className={styles.modalOverlay} onClick={() => setShowDispatchModal(false)}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <div className={styles.modalHeaderLeft}>
              <Bot size={24} className={styles.dispatcherIcon} />
              <div>
                <h3 className={styles.modalTitle}>Pre-Filing Details</h3>
                <p className={styles.modalSubtitle}>Provide details the AI could not extract from the screenshot</p>
              </div>
            </div>
            <button className={styles.modalClose} onClick={() => setShowDispatchModal(false)}>
              <X size={18} />
            </button>
          </div>

          <div className={styles.modalBody}>
            <div className={styles.modalFieldGroup}>
              <label className={styles.modalLabel}>
                <MapPin size={14} />
                State / UT
              </label>
              <select
                className={styles.modalSelect}
                value={dispatchForm.state}
                onChange={(e) => setDispatchForm(prev => ({ ...prev, state: e.target.value }))}
              >
                {INDIAN_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className={styles.modalFieldGroup}>
              <label className={styles.modalLabel}>
                <MapPin size={14} />
                District
              </label>
              <input
                type="text"
                className={styles.modalInput}
                placeholder="e.g. New Delhi, South Delhi, etc."
                value={dispatchForm.district}
                onChange={(e) => setDispatchForm(prev => ({ ...prev, district: e.target.value }))}
              />
            </div>

            <div className={styles.modalFieldGroup}>
              <label className={styles.modalLabel}>
                <Mail size={14} />
                Email Address (for complaint form)
              </label>
              <input
                type="email"
                className={styles.modalInput}
                placeholder="your-email@example.com"
                value={dispatchForm.email}
                onChange={(e) => setDispatchForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>

            <div className={styles.modalFieldGroup}>
              <label className={styles.modalLabel}>
                <Clock size={14} />
                Incident Date & Time
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="date"
                  className={styles.modalInput}
                  value={dispatchForm.incidentDate}
                  onChange={(e) => setDispatchForm(prev => ({ ...prev, incidentDate: e.target.value }))}
                />
                <select
                  className={styles.modalSelect}
                  style={{ width: '80px' }}
                  value={dispatchForm.incidentHour}
                  onChange={(e) => setDispatchForm(prev => ({ ...prev, incidentHour: e.target.value }))}
                >
                  {Array.from({length: 12}, (_, i) => String(i + 1).padStart(2, '0')).map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <select
                  className={styles.modalSelect}
                  style={{ width: '80px' }}
                  value={dispatchForm.incidentMinute}
                  onChange={(e) => setDispatchForm(prev => ({ ...prev, incidentMinute: e.target.value }))}
                >
                  {Array.from({length: 60}, (_, i) => String(i).padStart(2, '0')).map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select
                  className={styles.modalSelect}
                  style={{ width: '80px' }}
                  value={dispatchForm.incidentAmPm}
                  onChange={(e) => setDispatchForm(prev => ({ ...prev, incidentAmPm: e.target.value }))}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            <div className={styles.modalDivider} />

            <div className={styles.modalFieldGroup}>
              <label className={styles.modalLabel}>
                <User size={14} />
                Suspect Name
              </label>
              <input
                type="text"
                className={styles.modalInput}
                placeholder="Name or 'Unknown'"
                value={dispatchForm.suspectName}
                onChange={(e) => setDispatchForm(prev => ({ ...prev, suspectName: e.target.value }))}
              />
            </div>

            <div className={styles.modalFieldGroup}>
              <label className={styles.modalLabel}>
                <Phone size={14} />
                Suspect ID Type
              </label>
              <select
                className={styles.modalSelect}
                value={dispatchForm.suspectIdType}
                onChange={(e) => setDispatchForm(prev => ({ ...prev, suspectIdType: e.target.value }))}
              >
                {SUSPECT_ID_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className={styles.modalFieldGroup}>
              <label className={styles.modalLabel}>
                <Phone size={14} />
                Suspect Contact / ID
              </label>
              <input
                type="text"
                className={styles.modalInput}
                placeholder="Phone number, email, or social media handle"
                value={dispatchForm.suspectContact}
                onChange={(e) => setDispatchForm(prev => ({ ...prev, suspectContact: e.target.value }))}
              />
            </div>

            {analysis?.details?.rpa_filing_data?.platform && (
              <div className={styles.modalInfoBadge}>
                AI detected platform: <strong>{analysis.details.rpa_filing_data.platform}</strong>
              </div>
            )}
          </div>

          <div className={styles.modalFooter}>
            <button
              className={styles.modalCancelBtn}
              onClick={() => setShowDispatchModal(false)}
            >
              Cancel
            </button>
            <button
              className={styles.dispatcherBtn}
              onClick={handleDispatch}
            >
              <Bot size={16} />
              Launch Dispatcher
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
