import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

// ─── Indian States list for index mapping ───
const INDIAN_STATES = [
  '---Select---', 'ANDAMAN AND NICOBAR ISLANDS', 'ANDHRA PRADESH', 'ARUNACHAL PRADESH',
  'ASSAM', 'BIHAR', 'CHANDIGARH', 'CHHATTISGARH', 'DELHI', 'GOA', 'GUJARAT',
  'HARYANA', 'HIMACHAL PRADESH', 'JAMMU AND KASHMIR', 'JHARKHAND', 'KARNATAKA',
  'KERALA', 'LADAKH', 'LAKSHADWEEP', 'MADHYA PRADESH', 'MAHARASHTRA', 'MANIPUR',
  'MEGHALAYA', 'MIZORAM', 'NAGALAND', 'ODISHA', 'PUDUCHERRY', 'PUNJAB',
  'RAJASTHAN', 'SIKKIM', 'TAMIL NADU', 'TELANGANA', 'TRIPURA',
  'UTTAR PRADESH', 'UTTARAKHAND', 'WEST BENGAL',
];

// ─── Platform → Information Source index mapping (cybercrime portal dropdown) ───
const PLATFORM_TO_INFO_SOURCE: Record<string, number> = {
  'facebook': 1,
  'whatsapp': 2,
  'instagram': 3,
  'twitter': 4,
  'telegram': 5,
  'snapchat': 6,
  'other': 7,
};

// ─── Explicit textual label mapping to defeat index shifts ───
const FORCED_CATEGORY_LABEL = "Women/Children Related Crime";
const FORCED_SUBCATEGORY_LABEL = "Sexually Explicit Act";

// ─── Suspect ID type → dropdown index mapping ───
const SUSPECT_ID_TYPE_MAP: Record<string, number> = {
  'mobile': 1,
  'email': 2,
  'social_media_id': 3,
  'username': 3,
  'none': 0,
};

interface DispatchRequestBody {
  analysis: {
    risk_level: string;
    summary: string;
    flags: Array<{ category: string; description: string; severity: string; evidence: string }>;
    details: {
      tone_analysis?: string;
      manipulation_indicators?: string[];
      threat_indicators?: string[];
      recommendations?: string[];
      confidence_score?: number;
      legal_analysis?: {
        summary: string;
        potential_violations: string[];
      };
      rpa_filing_data?: {
        platform?: string;
        platform_url_or_id?: string | null;
        batch_id?: string;
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
  };
  evidence_base64?: string;
  evidence_mime_type?: string;
  evidence_items?: Array<{ base64: string, mime_type: string }>;
  upload_id: string;
  // User-provided fields from the pre-dispatch modal
  user_state: string;
  user_district: string;
  user_email: string;
  user_suspect_name: string;
  user_suspect_contact: string;
  user_suspect_id_type: string;
  user_incident_date?: string;
  user_incident_hour?: string;
  user_incident_minute?: string;
  user_incident_ampm?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: DispatchRequestBody = await request.json();
    const { analysis, evidence_base64, evidence_mime_type, evidence_items, upload_id } = body;

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis data is required' }, { status: 400 });
    }

    const rpaData = analysis.details?.rpa_filing_data;
    const suspectInfo = rpaData?.suspect_info;

    // ─── Save evidence to temp files ───
    const tmpDir = path.resolve(process.cwd(), '../rpa_tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const evidencePaths: string[] = [];

    // Handle multiple evidence items (Batch Upload)
    if (evidence_items && evidence_items.length > 0) {
      evidence_items.forEach((item, idx) => {
        const ext = (item.mime_type || 'image/png').includes('jpeg') ? '.jpg' : '.png';
        const p = path.join(tmpDir, `evidence_batch_${upload_id}_${idx}_${Date.now()}${ext}`);
        fs.writeFileSync(p, Buffer.from(item.base64, 'base64'));
        evidencePaths.push(p);
      });
    }
    // Handle single evidence (Legacy / Single Upload)
    else if (evidence_base64) {
      const ext = (evidence_mime_type || 'image/png').includes('jpeg') ? '.jpg' : '.png';
      const p = path.join(tmpDir, `evidence_${Date.now()}${ext}`);
      fs.writeFileSync(p, Buffer.from(evidence_base64, 'base64'));
      evidencePaths.push(p);
    }
    // Fallback dummy evidence
    else {
      const p = path.join(tmpDir, `evidence_dummy_${Date.now()}.png`);
      fs.writeFileSync(p, Buffer.from(
        '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82',
        'binary'
      ));
      evidencePaths.push(p);
    }

    // ─── Build the bot payload ───
    const platform = (rpaData?.platform || 'Other').toLowerCase();

    // State lookup
    const userStateUpper = (body.user_state || 'DELHI').toUpperCase();
    let stateIndex = INDIAN_STATES.findIndex(s => s === userStateUpper);
    if (stateIndex < 1) stateIndex = 8; // Default to Delhi

    // Info source from platform
    const infoSourceIndex = PLATFORM_TO_INFO_SOURCE[platform] || PLATFORM_TO_INFO_SOURCE['other'];

    // Build the 200+ char additional_info from analysis data
    let additionalInfo = `INCIDENT REPORT: ${analysis.summary || 'Online harassment incident reported through ShieldHer platform.'}`;

    // Add flag details
    if (analysis.flags && analysis.flags.length > 0) {
      additionalInfo += ' DETECTED ISSUES: ';
      additionalInfo += analysis.flags.map(f => `${f.category}: ${f.description}`).join('. ');
    }

    // Add legal context
    if (analysis.details?.legal_analysis?.summary) {
      additionalInfo += ` LEGAL CONTEXT: ${analysis.details.legal_analysis.summary}`;
    }

    // Ensure minimum 200 characters  
    while (additionalInfo.length < 210) {
      additionalInfo += ' The victim seeks immediate legal intervention and protection under applicable laws.';
    }

    // Sanitize: Remove special characters not allowed by the portal
    additionalInfo = additionalInfo.replace(/[~!#^`${}()<>*]/g, '').substring(0, 1490);

    // Build delay reason
    const delayReason = 'Due to severe psychological distress and the need for proper evidence analysis before reporting. The incident was analyzed using ShieldHer AI safety platform.';

    // Date and Time calculation: allow manual user overrides
    const incidentDate = body.user_incident_date || rpaData?.approximate_date || new Date().toISOString().split('T')[0];
    const incidentHour = body.user_incident_hour || '10';
    const incidentMinute = body.user_incident_minute || '30';
    const incidentAmPm = body.user_incident_ampm || 'AM';

    // Suspect info: prefer user-provided, fallback to AI-extracted
    const suspectName = body.user_suspect_name || suspectInfo?.name || 'Unknown Online Perpetrator';
    const suspectIdType = body.user_suspect_id_type || suspectInfo?.identifier_type || 'none';
    const suspectIdValue = body.user_suspect_contact || suspectInfo?.identifier_value || '';
    const suspectIdTypeIndex = SUSPECT_ID_TYPE_MAP[suspectIdType] || 0;

    let suspectDescription = suspectInfo?.description || 'Perpetrator operates through anonymous online accounts.';
    if (rpaData?.platform_url_or_id) {
      suspectDescription += ` Known handle/profile: ${rpaData.platform_url_or_id}.`;
    }
    // Portal allows max 250 chars for this field
    suspectDescription = suspectDescription.replace(/[~!#^`${}()<>*]/g, '').substring(0, 245);

    const botPayload = {
      complaint_id: upload_id || `shieldher-${Date.now()}`,
      category_label: FORCED_CATEGORY_LABEL,
      subcategory_label: FORCED_SUBCATEGORY_LABEL,
      date: incidentDate,
      hour: incidentHour,
      minute: incidentMinute,
      ampm: incidentAmPm,
      delay_reason: delayReason,
      state_label: userStateUpper,
      state_index: stateIndex,
      district_index: 1,  // First available district (the portal loads districts dynamically)
      user_district: body.user_district || '',
      platform: rpaData?.platform || 'Other',
      platform_label: rpaData?.platform ? Object.keys(PLATFORM_TO_INFO_SOURCE).includes(rpaData.platform.toLowerCase()) ? rpaData.platform : 'Other' : 'Other',
      info_source_index: infoSourceIndex,
      media_type_index: 1,
      email: body.user_email || 'anonymous@shieldher.app',
      additional_info: additionalInfo,
      evidence_paths: evidencePaths, // New array of paths
      suspect_name: suspectName,
      suspect_id_type_index: suspectIdTypeIndex,
      suspect_id_value: suspectIdValue,
      suspect_description: suspectDescription,
      risk_level: analysis.risk_level,
    };

    // ─── Write payload to temp file ───
    const payloadPath = path.join(tmpDir, `payload_${Date.now()}.json`);
    fs.writeFileSync(payloadPath, JSON.stringify(botPayload, null, 2));

    // ─── Spawn the Python bot ───
    const scriptPath = path.resolve(process.cwd(), '../rpa_complaint_bot.py');
    const venvPythonPath = path.resolve(process.cwd(), '../.venv/Scripts/python.exe');

    const child = spawn(venvPythonPath, [scriptPath, '--payload', payloadPath], {
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    return NextResponse.json({
      success: true,
      message: 'RPA bot launched with real analysis data',
      payload_path: payloadPath,
    });
  } catch (err: unknown) {
    console.error('Dispatch error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error occurred' },
      { status: 500 }
    );
  }
}
