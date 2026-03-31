import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Ephemeral AI Proxy Route
 * 
 * ZERO ADMIN ACCESS: This route receives a plaintext image from the browser,
 * sends it to Gemini for analysis, and returns the result. It NEVER saves
 * anything to the database or storage. The image exists only in server RAM
 * during the Gemini API call.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'Gemini API key is not configured' }, { status: 500 });
    }

    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Read the image from the request body (multipart form data)
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return NextResponse.json({ error: 'Image file is required' }, { status: 400 });
    }

    // Convert to base64 for Gemini
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imageFile.type || 'image/png';

    // Initialize the Gemini Vision model
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Define the analysis prompt (same as original analyze route)
    const prompt = `Analyze this chat screenshot for a women's protection application.
          
          CRITICAL INSTRUCTIONS:
          1. CONTEXT AWARENESS: Carefully evaluate the context, especially the recipient's responses. Distinguish between mutual banter/jokes and actual manipulative, coercive, or threatening behavior. Do not flag obvious mutual joking as critical abuse.
          2. BEHAVIORAL ANALYSIS: Look for signs of gaslighting, emotional blackmail, isolation tactics, DARVO, or physical threats.
          3. LEGAL ANALYSIS: Perform a preliminary legal analysis identifying any potential laws or legal frameworks that may have been violated (e.g., cyber harassment, stalking, terroristic threats). You MUST include a disclaimer that this is not official legal advice.
          
          Please format your response EXACTLY as a JSON object matching this schema without markdown code blocks:
          {
            "risk_level": "safe" | "low" | "medium" | "high" | "critical",
            "summary": "A concise overview of the conversation and findings",
            "flags": [
              {
                "category": "String (e.g., Direct Threats, Gaslighting, Mutual Banter)",
                "description": "String describing what was found",
                "severity": "safe" | "low" | "medium" | "high" | "critical",
                "evidence": "String quoting the specific text from the image"
              }
            ],
            "details": {
              "tone_analysis": "String analyzing the power dynamic and tone",
              "manipulation_indicators": ["Array of strings"],
              "threat_indicators": ["Array of strings"],
              "recommendations": ["Array of strings with actionable advice"],
              "confidence_score": "Number between 0 and 100",
              "legal_analysis": {
                "summary": "String",
                "potential_violations": ["Array of strings naming potential legal issues"],
                "disclaimer": "This AI-generated analysis is for informational purposes only and does not constitute professional legal advice. Please consult with a qualified attorney."
              }
            }
          }`;

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType,
      },
    };

    // Generate content — the image is only in RAM during this call
    const aiResponse = await model.generateContent([prompt, imagePart]);
    const text = aiResponse.response.text();

    // Parse the JSON safely
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(cleanText);

    // Return the AI result directly to the browser — NOTHING is saved to DB/storage
    return NextResponse.json({ success: true, analysis: result });

  } catch (error: unknown) {
    console.error('AI Proxy Error:', error);
    return NextResponse.json(
      { error: 'AI analysis failed. Please try again.' },
      { status: 500 }
    );
  }
}
