"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type Upload, type AnalysisResult } from "@/lib/types";
import RiskBadge from "@/components/RiskBadge";
import LoadingSpinner from "@/components/LoadingSpinner";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Brain,
  MessageSquare,
  Lightbulb,
  Scale,
  FileDown,
  Loader,
  CheckCircle,
  CalendarDays,
  Heart,
  Download,
  ImageIcon,
} from "lucide-react";
import styles from "./page.module.css";

const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif)$/i;
const AUDIO_EXT_REGEX = /\.(mp3|wav|m4a|ogg)$/i;

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
        .from("uploads")
        .select("*")
        .eq("id", uploadId)
        .single();

      if (uploadData) setUpload(uploadData);

      const { data: analysisData } = await supabase
        .from("analysis_results")
        .select("*")
        .eq("upload_id", uploadId)
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
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to generate report");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ShieldHer-Report-${analysis?.id?.substring(0, 8) || "report"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setGenerated(true);

      setTimeout(() => setGenerated(false), 4000);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to generate report. Please try again.");
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
          <Link href="/dashboard/history" className={styles.emptyButton}>
            Back to History
          </Link>
        </div>
      </div>
    );
  }

  const details = analysis.details || {};
  const fileUrls = (upload.file_url || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);

  const getFileKind = (url: string) => {
    let pathname = url;
    try {
      pathname = new URL(url).pathname;
    } catch {
      pathname = url;
    }

    const lower = pathname.toLowerCase();
    if (IMAGE_EXT_REGEX.test(lower)) return "image";
    if (AUDIO_EXT_REGEX.test(lower)) return "audio";
    return "other";
  };

  const mediaItems = fileUrls.map((url, index) => {
    const kind = getFileKind(url);
    const label =
      kind === "image"
        ? `Screenshot ${index + 1}`
        : kind === "audio"
          ? `Audio Recording ${index + 1}`
          : `File ${index + 1}`;
    return { url, kind, label };
  });

  const confidenceValue =
    typeof details.confidence_score === "number"
      ? Math.round(
          Math.max(
            0,
            Math.min(
              100,
              (details.confidence_score <= 1
                ? details.confidence_score * 100
                : details.confidence_score),
            ),
          ) * 10,
        ) / 10
      : null;

  const confidenceTone =
    confidenceValue === null
      ? "No score"
      : confidenceValue >= 80
        ? "High confidence match"
        : confidenceValue >= 60
          ? "Moderate confidence"
          : "Low confidence";

  const categories = analysis.flags?.map((flag) => flag.category.trim()) ?? [];
  const identifiedPatterns = Array.from(new Set(categories.filter(Boolean))).slice(0, 6);

  const mergedChecklist = [
    ...(details.recommendations ?? []),
    ...(details.manipulation_indicators ?? []),
    ...(details.threat_indicators ?? []),
  ]
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  const supportChecklist =
    mergedChecklist.length > 0
      ? mergedChecklist.slice(0, 4)
      : [
          "Preserve original screenshots with visible timestamps.",
          "Maintain a chronological evidence log for legal review.",
          "Avoid private follow-ups; keep responses formal and documented.",
        ];

  const previewMedia = mediaItems.find((item) => item.kind !== "other") ?? mediaItems[0] ?? null;

  return (
    <div className={styles.page}>
      <Link href="/dashboard/history" className={styles.back}>
        <ArrowLeft size={16} />
        Back to History
      </Link>

      <div className={styles.breadcrumb}>
        <span>History</span>
        <span className={styles.breadcrumbSlash}>/</span>
        <span className={styles.breadcrumbActive}>
          Analysis #{analysis.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      <section className={styles.heroGrid}>
        <div className={styles.heroMain}>
          <h1 className={styles.title}>
            Analysis <span>Report</span>
          </h1>
          <p className={styles.subtitle}>
            A detailed forensic breakdown of digital communication patterns and
            sentiment mapping for professional evidence collection.
          </p>

          <div className={styles.metaRow}>
            <div className={styles.metaItem}>
              <ImageIcon size={13} />
              <span>{upload.file_name}</span>
            </div>
            <div className={styles.metaItem}>
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
            </div>
            <RiskBadge level={analysis.risk_level} size="sm" />
          </div>
        </div>

        <aside className={styles.exportCard}>
          <div className={styles.exportHeader}>
            <FileDown size={20} />
            <h3>Export as Evidence PDF</h3>
          </div>
          <p>
            Generate a timestamped, tamper-evident PDF document suitable for
            legal proceedings or HR submissions.
          </p>
          <button
            className={styles.exportBtn}
            onClick={handleExportPDF}
            disabled={generating}
          >
            {generating ? (
              <>
                <Loader size={17} className="animate-spin" />
                Generating...
              </>
            ) : generated ? (
              <>
                <CheckCircle size={17} />
                Downloaded!
              </>
            ) : (
              <>
                Download PDF Report
                <Download size={16} />
              </>
            )}
          </button>
        </aside>
      </section>

      <section className={styles.primaryGrid}>
        <div className={styles.summaryPanel}>
          <div className={styles.panelHead}>
            <h2>
              <Brain size={18} />
              Analysis Summary
            </h2>
            <div className={styles.confidenceScoreWrap}>
              <strong>
                {confidenceValue !== null ? `${confidenceValue}%` : "--"}
              </strong>
              <span>System confidence</span>
            </div>
          </div>

          <div className={styles.confidenceTone}>
            <span className={styles.toneDot} />
            {confidenceTone}
          </div>

          <div className={styles.confidenceBar}>
            <div
              className={styles.confidenceFill}
              style={{ width: `${confidenceValue ?? 0}%` }}
            />
          </div>

          {identifiedPatterns.length > 0 && (
            <div className={styles.patternBlock}>
              <h4>Identified Patterns</h4>
              <div className={styles.patternChips}>
                {identifiedPatterns.map((pattern) => (
                  <span key={pattern} className={styles.patternChip}>
                    {pattern}
                  </span>
                ))}
              </div>
            </div>
          )}

          <blockquote className={styles.summaryQuote}>{analysis.summary}</blockquote>
        </div>

        <div className={styles.tonePanel}>
          <h2>
            <MessageSquare size={18} />
            Tone Analysis
          </h2>
          <p>
            {details.tone_analysis ||
              "No dedicated tone analysis was generated for this report."}
          </p>

          <div className={styles.toneMeter}>
            <div className={styles.toneMetaRow}>
              <span>Communication Risk Signal</span>
              <span>{confidenceValue !== null ? `${Math.max(0, Math.round(100 - confidenceValue))}%` : "--"}</span>
            </div>
            <div className={styles.toneTrack}>
              <div
                className={styles.toneFill}
                style={{ width: `${confidenceValue !== null ? Math.max(6, 100 - confidenceValue) : 12}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.evidenceSection}>
        <div className={styles.sectionHeading}>
          <h2>
            <CalendarDays size={18} />
            Uploaded Evidence
          </h2>
        </div>

        <div className={styles.evidenceGrid}>
          <div className={styles.evidenceStream}>
            {mediaItems.length > 0 ? (
              mediaItems.map((item) => (
                <article key={item.url} className={styles.evidenceBubble}>
                  <div className={styles.evidenceLabel}>{item.label}</div>
                  {item.kind === "image" ? (
                    <img src={item.url} alt={item.label} className={styles.evidenceImage} loading="lazy" />
                  ) : item.kind === "audio" ? (
                    <audio controls className={styles.audioPlayer}>
                      <source src={item.url} />
                      Your browser does not support the audio element.
                    </audio>
                  ) : (
                    <a href={item.url} target="_blank" rel="noreferrer" className={styles.mediaLink}>
                      Open uploaded file
                    </a>
                  )}
                </article>
              ))
            ) : (
              <div className={styles.noMedia}>No media evidence was attached.</div>
            )}
          </div>

          <aside className={styles.supportRail}>
            <div className={styles.checkCard}>
              {supportChecklist.map((tip, idx) => (
                <div key={`${tip}-${idx}`} className={styles.checkItem}>
                  <ShieldCheck size={16} />
                  <span>{tip}</span>
                </div>
              ))}
              <div className={styles.alonePill}>
                <Heart size={15} />
                You are not alone.
              </div>
            </div>

            {previewMedia && (
              <div className={styles.previewCard}>
                {previewMedia.kind === "image" ? (
                  <img
                    src={previewMedia.url}
                    alt={previewMedia.label}
                    className={styles.previewImage}
                    loading="lazy"
                  />
                ) : previewMedia.kind === "audio" ? (
                  <audio controls className={styles.audioPlayer}>
                    <source src={previewMedia.url} />
                    Your browser does not support the audio element.
                  </audio>
                ) : (
                  <a href={previewMedia.url} target="_blank" rel="noreferrer" className={styles.mediaLink}>
                    Open uploaded file
                  </a>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>

      {analysis.flags && analysis.flags.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>
              <AlertTriangle size={18} />
              Detected Flags ({analysis.flags.length})
            </h2>
          </div>
          <div className={styles.flagGrid}>
            {analysis.flags.map((flag, i) => (
              <article key={i} className={styles.flagCard}>
                <div className={styles.flagHeader}>
                  <RiskBadge level={flag.severity} size="sm" />
                  <span className={styles.flagCategory}>{flag.category}</span>
                </div>
                <p className={styles.flagDesc}>{flag.description}</p>
                {flag.evidence && (
                  <div className={styles.evidenceText}>
                    <MessageSquare size={13} />
                    <span>&ldquo;{flag.evidence}&rdquo;</span>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {details.manipulation_indicators && details.manipulation_indicators.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>
              <AlertTriangle size={18} />
              Manipulation Indicators
            </h2>
          </div>
          <ul className={styles.bulletList}>
            {details.manipulation_indicators.map((ind, i) => (
              <li key={i}>{ind}</li>
            ))}
          </ul>
        </section>
      )}

      {details.recommendations && details.recommendations.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>
              <Lightbulb size={18} />
              Recommendations
            </h2>
          </div>
          <ul className={styles.recommendationList}>
            {details.recommendations.map((rec, i) => (
              <li key={i}>
                <ShieldCheck size={15} />
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {details.legal_analysis && (
        <section className={styles.section}>
          <div className={styles.sectionHeading}>
            <h2>
              <Scale size={18} />
              Preliminary Legal Analysis
            </h2>
          </div>

          <div className={styles.legalGrid}>
            <div className={styles.legalSummaryCard}>
              <p className={styles.legalSummary}>{details.legal_analysis.summary}</p>

              {details.legal_analysis.potential_violations &&
                details.legal_analysis.potential_violations.length > 0 && (
                  <ul className={styles.legalList}>
                    {details.legal_analysis.potential_violations.map((violation, i) => (
                      <li key={i}>{violation}</li>
                    ))}
                  </ul>
                )}
            </div>

            <aside className={styles.disclaimerCard}>
              <h4>
                <AlertTriangle size={16} />
                Legal Disclaimer
              </h4>
              <p>{details.legal_analysis.disclaimer}</p>
            </aside>
          </div>
        </section>
      )}
    </div>
  );
}
