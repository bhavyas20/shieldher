export type RiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';
export type UploadStatus = 'pending' | 'analyzing' | 'completed' | 'flagged';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  ghost_mode: boolean;
  encryption_salt: string | null;
  created_at: string;
}

export interface Upload {
  id: string;
  user_id: string;
  file_url: string;
  file_name: string;
  file_iv: string | null;         // IV for encrypted image
  original_type: string | null;   // original MIME type (e.g. image/png)
  status: UploadStatus;
  created_at: string;
  analysis_results?: AnalysisResult[];
}

export interface AnalysisFlag {
  category: string;
  description: string;
  severity: RiskLevel;
  evidence: string;
}

export interface AnalysisResult {
  id: string;
  upload_id: string;
  risk_level: RiskLevel;           // Kept plaintext for filtering
  // Encrypted fields (base64 encoded)
  encrypted_summary: string | null;
  encrypted_flags: string | null;
  encrypted_details: string | null;
  encryption_iv: string | null;
  // Legacy plaintext fields (for backward compat with old data)
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
}

export interface Report {
  id: string;
  user_id: string;
  upload_id: string;
  analysis_id: string;
  file_name: string;
  file_url: string;
  risk_level: RiskLevel;
  created_at: string;
}
