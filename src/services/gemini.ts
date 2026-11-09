import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export interface ParsedPunchItem {
  location: string;
  defectTitle: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  recommendedAction: string;
}

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

// Fast multi-model failover chain from your enabled account models
const MODEL_CASCADE = [
  'gemini-3.5-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.8-flash',
];

export async function analyzeDefectWithAI(
  photoUri: string,
  audioUri: string
): Promise<ParsedPunchItem> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'PASTE_YOUR_KEY_HERE') {
    throw new Error('Missing EXPO_PUBLIC_GEMINI_API_KEY in .env file.');
  }

  const startTime = Date.now();
  console.log('--- [WalkPunch AI] Starting Defect Analysis ---');

  const manipulatedImage = await manipulateAsync(
    photoUri,
    [{ resize: { width: 768 } }],
    { compress: 0.5, format: SaveFormat.JPEG, base64: true }
  );

  const photoBase64 = manipulatedImage.base64 || (await new File(photoUri).base64());
  const audioBase64 = await new File(audioUri).base64();

  console.log(
    `[WalkPunch AI] Payload encoded in ${Date.now() - startTime}ms | Photo: ${Math.round(
      photoBase64.length / 1024
    )}KB | Audio: ${Math.round(audioBase64.length / 1024)}KB`
  );

  const systemPrompt = `You are an expert property inspector and general contractor assistant.
Analyze both the attached defect photo and the inspector's spoken voice note.
Return ONLY a valid JSON object matching this exact schema:
{
  "location": "Room or area name mentioned or visible (e.g., Kitchen, Master Bath, Exterior)",
  "defectTitle": "Short, professional 3-6 word title of the defect",
  "description": "Clear, client-ready 1-2 sentence description of the issue observed",
  "severity": "Low" | "Medium" | "High" | "Critical",
  "recommendedAction": "Specific trade and recommended repair action (e.g., Plumber: Replace P-trap gasket and test for leaks)"
}`;

  const requestBody = JSON.stringify({
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
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  for (const modelName of MODEL_CASCADE) {
    const modelStart = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      console.log(`[WalkPunch AI] Sending request to ${modelName}...`);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: requestBody,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find((p: any) => !p.thought && p.text) || parts[0];
        const rawText = textPart?.text;

        if (!rawText) {
          console.warn(`[WalkPunch AI] Empty text from ${modelName}, trying next model...`);
          continue;
        }

        const cleanedJson = rawText.replace(/```json|```/g, '').trim();
        console.log(
          `[WalkPunch AI] Success with ${modelName} in ${((Date.now() - modelStart) / 1000).toFixed(1)}s`
        );

        return JSON.parse(cleanedJson) as ParsedPunchItem;
      }

      const errorText = await response.text();
      console.warn(
        `[WalkPunch AI] ${modelName} returned ${response.status}: ${errorText.slice(0, 120)}`
      );
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn(
        `[WalkPunch AI] ${modelName} timed out or failed after ${((Date.now() - modelStart) / 1000).toFixed(1)}s`
      );
    }
  }

  // Fallback card only if all 3 models are unreachable
  return {
    location: 'GENERAL / UNASSIGNED',
    defectTitle: 'Logged Defect (Tap Edit or Retry AI)',
    description:
      'Photo and voice note saved locally. Tap Edit to enter details manually or tap Retry AI.',
    severity: 'Medium',
    recommendedAction: 'Inspector: Replay voice note or tap Retry AI.',
  };
}