import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface ParsedPunchItem {
  location: string;
  trade: string;
  defectTitle: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  recommendedAction: string;
}

const GEMINI_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

async function prepareCompressedPhotoBase64(photoUri: string): Promise<string> {
  const manipulated = await manipulateAsync(
    photoUri,
    [{ resize: { width: 768 } }],
    { compress: 0.65, format: SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) {
    throw new Error('Failed to encode compressed photo to Base64.');
  }
  return manipulated.base64;
}

async function readAudioAsBase64(audioUri: string): Promise<string> {
  const file = new File(audioUri);
  return await file.base64();
}

export async function analyzeDefectWithAI(
  photoUri: string,
  audioUri: string
): Promise<ParsedPunchItem> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Missing EXPO_PUBLIC_GEMINI_API_KEY.');
  }

  const [photoBase64, audioBase64] = await Promise.all([
    prepareCompressedPhotoBase64(photoUri),
    readAudioAsBase64(audioUri),
  ]);

  const systemPrompt = `
You are an expert Construction Superintendent, Remodeler, and Building Inspector conducting a punch-out walk.
Analyze the attached jobsite photo and the inspector's voice recording.
Use clear construction, remodeling, and building code terminology (e.g., trim-out, drywall flashing, reveal, caulk joint, GFI/GFCI, plumb/level, finish coat, hardware alignment).
If the speaker names a specific subcontractor or trade, assign it to "trade". Otherwise assign the standard construction trade (e.g., Drywall & Paint, Finish Carpentry, Electrical, Plumbing, HVAC, Tile & Flooring, Cabinets & Millwork, Glazing & Windows, Exterior / Roofing, General Punch).
Return ONLY a valid JSON object with the following exact keys:
{
  "location": "Room or building elevation in UPPERCASE (e.g., KITCHEN, MASTER BATH, GARAGE, NORTH EXTERIOR)",
  "trade": "Assigned trade category or named subcontractor (e.g., Drywall & Paint, Electrical, Plumbing, Finish Carpentry)",
  "defectTitle": "Concise 3 to 6 word construction punch title",
  "severity": "One of: Low, Medium, High, Critical",
  "description": "Clear, professional 1 to 2 sentence field observation of the workmanship defect, damage, or code issue.",
  "recommendedAction": "Specific corrective scope of work required for punch-out sign-off."
}
`.trim();

  for (const modelName of GEMINI_MODELS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 14000);

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt },
                {
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: photoBase64,
                  },
                },
                {
                  inlineData: {
                    mimeType: 'audio/mp4',
                    data: audioBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
          },
        }),
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[WalkPunch AI] ${modelName} returned status ${response.status}`);
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) continue;

      const cleanedJson = rawText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(cleanedJson);

      return {
        location: parsed.location || 'GENERAL / UNASSIGNED',
        trade: parsed.trade || 'General Punch',
        defectTitle: parsed.defectTitle || 'Logged Punch Item',
        severity: ['Low', 'Medium', 'High', 'Critical'].includes(parsed.severity)
          ? parsed.severity
          : 'Medium',
        description: parsed.description || 'Deficiency logged during jobsite walk.',
        recommendedAction:
          parsed.recommendedAction || 'Complete corrective repair and verify on re-walk.',
      };
    } catch (err) {
      console.warn(`[WalkPunch AI] Model ${modelName} failed, trying next...`, err);
    }
  }

  return {
    location: 'GENERAL / UNASSIGNED',
    trade: 'General Punch',
    defectTitle: 'Logged Defect (Tap Edit or Retry AI)',
    severity: 'Medium',
    description:
      'Photo and voice note saved locally. Tap Edit to enter details manually or tap Retry AI.',
    recommendedAction: 'Replay voice note or tap Retry AI.',
  };
}