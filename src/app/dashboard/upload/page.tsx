'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, Loader, Info, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import UploadZone from '@/components/UploadZone';
import { createClient } from '@/lib/supabase/client';
import { retrieveKey, encryptText, encryptFile } from '@/lib/crypto';
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

      // E2EE: Retrieve the encryption key from sessionStorage
      const encryptionKey = await retrieveKey();
      if (!encryptionKey) {
        throw new Error('Encryption key not found. Please log out and log back in.');
      }

      for (const file of files) {
        // ═══ STEP 1: Send plaintext image to AI proxy (ephemeral, saves nothing) ═══
        setAnalyzing(true);
        const formData = new FormData();
        formData.append('image', file);

        const aiRes = await fetch('/api/ai-proxy', {
          method: 'POST',
          body: formData,
        });

        if (!aiRes.ok) {
          const errData = await aiRes.json();
          throw new Error(errData.error || 'AI analysis failed');
        }

        const { analysis: aiResult } = await aiRes.json();

        // ═══ STEP 2: Encrypt everything in the browser ═══
        setAnalyzing(false);
        setEncrypting(true);

        // Encrypt the image file
        const { iv: fileIv, encryptedBlob } = await encryptFile(encryptionKey, file);

        // Encrypt the analysis text fields
        const encryptedSummary = await encryptText(encryptionKey, aiResult.summary || '');
        const encryptedFlags = await encryptText(encryptionKey, JSON.stringify(aiResult.flags || []));
        const encryptedDetails = await encryptText(encryptionKey, JSON.stringify(aiResult.details || {}));

        // ═══ STEP 3: Upload encrypted image blob to Supabase Storage ═══
        const fileName = `${user.id}/${Date.now()}-${file.name}.enc`;
        const { error: storageError } = await supabase.storage
          .from('screenshots')
          .upload(fileName, encryptedBlob, {
            contentType: 'application/octet-stream',
          });

        if (storageError) throw storageError;

        const { data: { publicUrl } } = supabase.storage
          .from('screenshots')
          .getPublicUrl(fileName);

        // ═══ STEP 4: Save encrypted records to database ═══
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
            file_iv: fileIv,
            original_type: file.type || 'image/png',
            status: finalStatus,
          })
          .select()
          .single();

        if (dbError) throw dbError;

        // Create encrypted analysis result
        if (upload) {
          const { error: analysisError } = await supabase
            .from('analysis_results')
            .insert({
              upload_id: upload.id,
              risk_level: aiResult.risk_level, // Plaintext — safe for filtering
              encrypted_summary: JSON.stringify(encryptedSummary),
              encrypted_flags: JSON.stringify(encryptedFlags),
              encrypted_details: JSON.stringify(encryptedDetails),
              encryption_iv: encryptedSummary.iv,
              // Legacy plaintext fields set to placeholders
              summary: '[encrypted]',
              flags: [],
              details: {},
            });

          if (analysisError) throw analysisError;
        }

        setEncrypting(false);
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
                  AI Analyzing...
                </>
              ) : encrypting ? (
                <>
                  <Loader size={18} className="animate-spin" />
                  Encrypting &amp; Saving...
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
