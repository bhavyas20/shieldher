"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type Upload, type AnalysisResult } from "@/lib/types";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  FileSearch,
  ArrowLeft,
  Filter,
  Calendar,
  AlertTriangle,
  ArrowRight,
  ImageIcon,
} from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

interface UploadWithAnalysis extends Upload {
  analysis_results: AnalysisResult[];
}

const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp|gif|bmp|svg)(\?.*)?$/i;

function getPrimaryAsset(fileUrl: string) {
  return fileUrl
    .split(",")
    .map((url) => url.trim())
    .find((url) => url.length > 0);
}

function isImageAsset(url: string) {
  return IMAGE_EXT_REGEX.test(url);
}

function formatConfidence(score?: number) {
  if (typeof score !== "number" || Number.isNaN(score)) return "--";
  const normalized = score <= 1 ? score * 100 : score;
  return `${Math.round(normalized * 10) / 10}%`;
}

export default function HistoryPage() {
  const [uploads, setUploads] = useState<UploadWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "flagged" | "safe">("all");

  useEffect(() => {
    async function fetchHistory() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("uploads")
        .select("*, analysis_results(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (data) setUploads(data as UploadWithAnalysis[]);
      setLoading(false);
    }
    fetchHistory();
  }, []);

  const filtered = uploads.filter((u) => {
    if (filter === "all") return true;
    if (filter === "flagged") return u.status === "flagged";
    return (
      u.status === "completed" &&
      u.analysis_results?.some(
        (a) => a.risk_level === "safe" || a.risk_level === "low",
      )
    );
  });

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingWrap}>
          <LoadingSpinner text="Loading history..." />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link href="/dashboard" className={styles.back}>
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>Analysis History</h1>
        <p className={styles.subtitle}>
          Browse your past screenshot uploads and review detailed AI analysis
          reports. Our system identifies structural discrepancies and security
          vulnerabilities in real-time.
        </p>
      </div>

      <div className={styles.filtersWrapper}>
        <div className={styles.filterIconWrap}>
          <Filter size={16} />
        </div>
        <div className={styles.filters}>
          {(["all", "flagged", "safe"] as const).map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${filter === f ? styles.active : ""}`}
              onClick={() => setFilter(f)}
            >
              <span className={styles.filterDot} data-type={f} />
              {f === "all"
                ? "All Uploads"
                : f === "flagged"
                  ? "Flagged Issues"
                  : "Safe Results"}
            </button>
          ))}
        </div>
        <div className={styles.dateRangeChip}>
          <Calendar size={14} />
          Date Range
        </div>
      </div>

      {filtered.length > 0 ? (
        <div className={styles.list}>
          {filtered.map((upload) => {
            const analyses = upload.analysis_results ?? [];
            const primaryAsset = getPrimaryAsset(upload.file_url);
            const statusTone =
              upload.status === "flagged"
                ? "flagged"
                : upload.status === "completed"
                  ? "safe"
                  : "processing";
            const statusLabel =
              upload.status === "flagged"
                ? "Flagged"
                : upload.status === "completed"
                  ? "Safe"
                  : "Processing";

            return (
              <article key={upload.id} className={styles.uploadCard}>
                <div className={styles.mediaPane}>
                  <span className={`${styles.mediaStatus} ${styles[statusTone]}`}>
                    {statusLabel}
                  </span>
                  {primaryAsset && isImageAsset(primaryAsset) ? (
                    <img
                      src={primaryAsset}
                      alt={upload.file_name}
                      className={styles.mediaImage}
                    />
                  ) : (
                    <div className={styles.mediaPlaceholder}>
                      <ImageIcon size={34} />
                      <span>No preview available</span>
                    </div>
                  )}
                </div>

                <div className={styles.contentPane}>
                  <div className={styles.cardTitleWrap}>
                    <h3 className={styles.fileName}>{upload.file_name}</h3>
                    <span className={styles.uploadDate}>
                      UPLOADED: {new Date(upload.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  {analyses.length > 0 ? (
                    <div className={styles.analysisStack}>
                      {analyses.map((analysis) => {
                        const firstFlag = analysis.flags?.[0];

                        return (
                          <section key={analysis.id} className={styles.analysisBlock}>
                            <p className={styles.summary}>{analysis.summary}</p>

                            {firstFlag && (
                              <div className={styles.alertBox}>
                                <div className={styles.alertTitle}>
                                  <AlertTriangle size={15} />
                                  Flag Detected: {firstFlag.category}
                                </div>
                                <p className={styles.alertDescription}>
                                  {firstFlag.description}
                                </p>
                              </div>
                            )}

                            <div className={styles.analysisMeta}>
                              <div className={styles.metaInfo}>
                                <span>
                                  AI Confidence: {formatConfidence(analysis.details?.confidence_score)}
                                </span>
                                <span>Report #{analysis.id.slice(0, 8).toUpperCase()}</span>
                              </div>
                              <Link
                                href={`/dashboard/analysis/${analysis.upload_id}`}
                                className={styles.analysisLink}
                              >
                                View Full Analysis
                                <ArrowRight size={15} />
                              </Link>
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.noAnalysis}>
                      Analysis is still processing for this upload.
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIconWrap}>
            <FileSearch size={30} />
          </div>
          <h3>No results found</h3>
          <p>
            {filter !== "all"
              ? "Try changing your filter to see more results."
              : "Upload some screenshots to get started."}
          </p>
          <Link href="/dashboard/upload" className={styles.emptyButton}>
            New Upload
          </Link>
        </div>
      )}
    </div>
  );
}
