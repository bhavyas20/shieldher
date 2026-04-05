"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type Upload, type AnalysisResult } from "@/lib/types";
import { deriveKey, decryptText, decryptFile, storeKey } from "@/lib/crypto";
import AnalysisCard from "@/components/AnalysisCard";
import LoadingSpinner from "@/components/LoadingSpinner";
import RiskBadge from "@/components/RiskBadge";
import { FileSearch, Clock, ImageIcon, ArrowLeft, Filter, AlertTriangle, Lock } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

interface UploadWithAnalysis extends Upload {
  analysis_results: AnalysisResult[];
  decrypted_url?: string;
}

export default function HistoryPage() {
  const [uploads, setUploads] = useState<UploadWithAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "flagged" | "safe">("all");
  
  // Lock screen state
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlocking, setUnlocking] = useState(false);

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

      if (data) {
        setUploads(data as UploadWithAnalysis[]);
      }
      setLoading(false);
    }
    fetchHistory();
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true);
    setUnlockError("");

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Not logged in");

      // Verify the password with Supabase
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordPrompt,
      });

      if (error) {
        throw new Error("Incorrect password");
      }

      // Check if we have legacy encrypted text OR encrypted images
      const hasEncryptedData = uploads.some((u) =>
        u.file_iv || u.analysis_results?.some((a) => a.summary === "[encrypted]" || a.encrypted_summary)
      );

      if (hasEncryptedData) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("encryption_salt")
          .eq("id", user.id)
          .single();

        if (profile?.encryption_salt) {
          try {
            const key = await deriveKey(passwordPrompt, profile.encryption_salt);
            await storeKey(key, profile.encryption_salt); // Cache it globally for the session limits
            
            // Decrypt legacy items AND images
            const decryptedUploads = await Promise.all(
              uploads.map(async (upload) => {
                let decryptedUrl = undefined;

                if (upload.file_iv) {
                  try {
                    const res = await fetch(upload.file_url);
                    if (res.ok) {
                      const buf = await res.arrayBuffer();
                      const decryptedBlob = await decryptFile(key, buf, upload.file_iv, upload.original_type || 'image/png');
                      decryptedUrl = URL.createObjectURL(decryptedBlob);
                    }
                  } catch (e) {
                    console.error("Failed to decrypt image", e);
                  }
                }

                if (upload.analysis_results) {
                  const decryptedResults = await Promise.all(
                    upload.analysis_results.map(async (analysis) => {
                      if (analysis.encrypted_summary) {
                        try {
                          const payload = JSON.parse(analysis.encrypted_summary);
                          const decryptedSummary = await decryptText(key, payload);
                          return { ...analysis, summary: decryptedSummary };
                        } catch {
                          return analysis;
                        }
                      }
                      return analysis;
                    })
                  );
                  return { ...upload, analysis_results: decryptedResults, decrypted_url: decryptedUrl };
                }
                return { ...upload, decrypted_url: decryptedUrl };
              })
            );
            setUploads(decryptedUploads);
          } catch (err) {
            console.error("Failed to decrypt secure items", err);
          }
        }
      }

      setIsUnlocked(true);
    } catch (err: any) {
      setUnlockError(err.message || "Failed to unlock history.");
    } finally {
      setUnlocking(false);
      setPasswordPrompt("");
    }
  };

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

  const hasLegacyEncrypted = uploads.some((u) =>
    u.analysis_results?.some((a) => a.summary === "[encrypted]")
  );

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
          reports.
        </p>
      </div>

      {!isUnlocked && (
        <div className={styles.unlockBanner}>
          <div className={styles.bannerIcon}>
            <Lock size={20} />
          </div>
          <div className={styles.bannerContent}>
            <h3 className={styles.bannerTitle}>History is Encrypted</h3>
            <p className={styles.bannerText}>Enter your password to unlock the vault and reveal your sensitive analysis data.</p>
          </div>
          <form onSubmit={handleUnlock} className={styles.bannerForm}>
            <input
              type="password"
              placeholder="Your password..."
              className={styles.bannerInput}
              value={passwordPrompt}
              onChange={(e) => setPasswordPrompt(e.target.value)}
              disabled={unlocking}
            />
            <button type="submit" className={styles.bannerBtn} disabled={unlocking || !passwordPrompt}>
              {unlocking ? "Decrypting..." : "Unlock Vault"}
            </button>
          </form>
          {unlockError && <div className={styles.bannerError}>{unlockError}</div>}
        </div>
      )}

      <div className={styles.filtersWrapper}>
        <div className={styles.filterIconWrap}>
          <Filter size={18} />
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
      </div>

      {filtered.length > 0 ? (
        <div className={styles.list}>
          {filtered.map((upload) => (
            <div key={upload.id} className={styles.uploadCard}>
              <div className={styles.uploadHeader}>
                <div className={styles.uploadInfo}>
                  {isUnlocked && upload.file_url ? (
                    <img src={upload.decrypted_url || upload.file_url} alt="Screenshot" className={styles.thumbnail} />
                  ) : (
                    <div className={styles.iconBox}>
                      {isUnlocked ? <ImageIcon size={24} /> : <Lock size={20} />}
                    </div>
                  )}
                  <div>
                    <span className={styles.fileName}>{upload.file_name}</span>
                    <span className={styles.uploadDate}>
                      <Clock size={12} />
                      {new Date(upload.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>
                <div className={styles.statusBox}>
                  <RiskBadge
                    level={
                      upload.status === "flagged"
                        ? "high"
                        : upload.status === "completed"
                          ? "safe"
                          : "medium"
                    }
                  />
                </div>
              </div>

              {!isUnlocked ? (
                <div className={styles.lockedAnalysis}>
                  <Lock size={16} />
                  <span>Protected AI Analysis. Unlock vault to view flags and recommendations.</span>
                </div>
              ) : upload.analysis_results && upload.analysis_results.length > 0 ? (
                <div className={styles.analysisSection}>
                  {upload.analysis_results.map((analysis) => (
                    <AnalysisCard key={analysis.id} analysis={analysis} />
                  ))}
                </div>
              ) : (
                <div className={styles.noAnalysis}>
                  <p>Analysis is still processing for this upload.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIconWrap}>
            <FileSearch size={32} />
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
