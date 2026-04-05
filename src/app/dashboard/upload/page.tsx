'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Loader, Info, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import UploadZone from '@/components/UploadZone';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

export default function UploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [encrypting, setEncrypting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleFilesSelected = (newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setError('');
  };

  const handleAnalyze = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setError('');

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Please sign in to upload');

      // ═══ STEP 1: Send ALL plaintext images to AI proxy (ephemeral) ═══
      setAnalyzing(true);
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('image', file);
      });

      const aiRes = await fetch('/api/ai-proxy', {
        method: 'POST',
        body: formData,
      });

      if (!aiRes.ok) {
        const errData = await aiRes.json();
        throw new Error(errData.error || 'AI analysis failed');
      }

      const { analysis: aiResult } = await aiRes.json();

      // Generate a batch ID to link multiple screenshots in a single session
      const batchId = crypto.randomUUID();

      // ═══ STEP 2: Upload images and save records ═══
      for (const file of files) {
        setAnalyzing(false);
        setUploading(true);

        const fileName = `${user.id}/${Date.now()}-${file.name}`;
        const { error: storageError } = await supabase.storage
          .from('screenshots')
          .upload(fileName, file, {
            contentType: file.type || 'image/png',
          });

        if (storageError) {
          console.error("Storage Error:", storageError);
          throw new Error(`File upload failed: ${storageError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('screenshots')
          .getPublicUrl(fileName);

        // ═══ STEP 3: Save analysis records to database ═══
        const finalStatus =
          aiResult.risk_level === 'high' || aiResult.risk_level === 'critical'
            ? 'flagged'
            : 'completed';

        // Create the upload record
        const { data: upload, error: dbError } = await supabase
          .from('uploads')
          .insert({
            user_id: user.id,
            file_url: publicUrl,
            file_name: file.name,
            original_type: file.type || 'image/png',
            status: finalStatus,
          })
          .select()
          .single();

        if (dbError) {
          console.error("Upload DB Error:", dbError);
          throw new Error(`Database error (uploads): ${dbError.message}`);
        }

        // Createplaintext analysis result for permanent history
        if (upload) {
          const { error: analysisError } = await supabase
            .from('analysis_results')
            .insert({
              upload_id: upload.id,
              risk_level: aiResult.risk_level,
              summary: aiResult.summary,
              flags: aiResult.flags || [],
              details: {
                ...(aiResult.details || {}),
                batch_id: batchId, // Link all uploads in this batch
              },
            });

          if (analysisError) {
            console.error("Analysis DB Error:", analysisError);
            throw new Error(`Database error (analysis_results): ${analysisError.message}`);
          }
        }
      }

      router.push('/dashboard/history');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setUploading(false);
      setAnalyzing(false);
      setEncrypting(false);
    }
  };

  return (
    <div className={styles.page}>
      <Link href="/dashboard" className={styles.back}>
        <ArrowLeft size={16} />
        Back to Dashboard
      </Link>

      <div className={styles.header}>
        <h1 className={styles.title}>Upload Screenshots</h1>
        <p className={styles.subtitle}>
          Upload chat screenshots for AI-powered analysis. We&apos;ll detect harmful
          patterns, manipulation, and potential threats.
        </p>
      </div>

      <div className={styles.bentoContainer}>
        <div className={styles.uploadCard}>
          <UploadZone onFilesSelected={handleFilesSelected} isUploading={uploading} />

          {error && (
            <div className={styles.error}>{error}</div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.analyzeButton}
              onClick={handleAnalyze}
              disabled={files.length === 0 || uploading || analyzing || encrypting}
            >
              {uploading && !analyzing && !encrypting ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Preparing...
                </>
              ) : analyzing ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  AI Analyzing &amp; Saving...
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Analyze {files.length > 0 ? `(${files.length})` : ''}
                </>
              )}
            </button>
          </div>
        </div>

        <div className={styles.tipsCard}>
          <div className={styles.tipsHeader}>
            <div className={styles.tipsIcon}>
              <Info size={20} />
            </div>
            <h3>Tips for best results</h3>
          </div>
          <ul className={styles.tipsList}>
            <li>Take clear, full-screen screenshots of the chat</li>
            <li>Include the full conversation thread when possible</li>
            <li>Make sure text is readable and not blurry</li>
            <li>You can upload multiple screenshots at once</li>
          </ul>

          <div className={styles.tipsHeader} style={{ marginTop: '1.2rem' }}>
            <div className={styles.tipsIcon}>
              <ShieldCheck size={20} />
            </div>
            <h3>End-to-End Encrypted</h3>
          </div>
          <ul className={styles.tipsList}>
            <li>Your images are encrypted before leaving your browser</li>
            <li>AI analysis runs through a secure ephemeral proxy</li>
            <li>Only you can decrypt and view your data</li>
            <li>Even platform admins cannot access your content</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
