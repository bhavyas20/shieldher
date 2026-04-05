import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, FileText, CheckCircle2 } from "lucide-react";
import styles from "./UploadZone.module.css";

interface UploadedFile {
  file: File;
  preview: string;
  status: "ready" | "uploading" | "done" | "error";
}

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  isUploading?: boolean;
}

export default function UploadZone({
  onFilesSelected,
  isUploading = false,
}: UploadZoneProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        status: "ready" as const,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
      onFilesSelected(acceptedFiles);
    },
    [onFilesSelected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <div className={styles.wrapper}>
      <div
        {...getRootProps()}
        className={`${styles.dropzone} ${isDragActive ? styles.active : ""} ${isUploading ? styles.disabled : ""
          }`}
      >
        <input {...getInputProps()} />
        <div className={styles.content}>
          <div className={styles.iconWrapper}>
            <Upload className={styles.icon} />
          </div>
          <h3>Drag & drop chat screenshots</h3>
          <p>or click to browse • PNG, JPG, WebP up to 10MB</p>
        </div>
      </div>

      {files.length > 0 && (
        <div className={styles.fileList}>
          {files.map((file, index) => (
            <div key={index} className={styles.fileCard}>
              <div className={styles.filePreview}>
                {file.file.type.startsWith("image/") ? (
                  <img src={file.preview} alt="preview" />
                ) : (
                  <FileText size={24} />
                )}
              </div>
              <div className={styles.fileInfo}>
                <span className={styles.fileName}>{file.file.name}</span>
                <span className={styles.fileSize}>
                  {(file.file.size / 1024).toFixed(0)} KB
                </span>
              </div>
              <button
                className={styles.removeBtn}
                onClick={() => removeFile(index)}
                disabled={isUploading}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}