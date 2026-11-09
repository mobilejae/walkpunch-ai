import { File } from 'expo-file-system';

export interface ParsedPunchItem {
  location: string;
  defectTitle: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  recommendedAction: string;
}

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;

export async function analyzeDefectWithAI(
  photoUri: string,
  audioUri: string
): Promise<ParsedPunchItem> {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'PASTE_YOUR_KEY_HERE') {
    throw new Error('Missing EXPO_PUBLIC_GEMINI_API_KEY in .env file.');
  }

  const photoBase64 = await new File(photoUri).base64();
  const audioBase64 = await new File(audioUri).base64();

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

  const response = await fetch(GEMINI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawText) {
    throw new Error('Empty response from Gemini AI.');
  }

  return JSON.parse(rawText) as ParsedPunchItem;
}