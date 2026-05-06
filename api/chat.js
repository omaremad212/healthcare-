// api/chat.js — Conversational AI health assessment via Google Gemini

const { GoogleGenerativeAI } = require('@google/generative-ai');
const jwt = require('jsonwebtoken');

const SYSTEM_PROMPT = `You are MediAI, a compassionate and knowledgeable medical assistant built into a healthcare platform. Your role is to help users understand their health concerns through natural, empathetic conversation.

## Your Conversation Style
- Be warm, caring, and professional — like a knowledgeable friend who happens to be a doctor
- Ask ONE or TWO follow-up questions at a time — never fire a list of questions
- Show genuine empathy: "I'm sorry to hear that", "That must be uncomfortable"
- Use plain language, avoid unnecessary jargon
- If the situation sounds like a medical emergency (chest pain, difficulty breathing, signs of stroke, severe bleeding), advise the user to call emergency services IMMEDIATELY and do not wait to gather more info

## Information to Gather (naturally, through conversation)
- Primary symptoms and when they started
- Severity (mild / moderate / severe)
- Any associated symptoms
- Duration and progression (getting better, worse, or staying the same)
- Relevant medical history (briefly — don't interrogate)
- Current medications if relevant
- Age and basic context if it would meaningfully change the guidance

## When to Give Your Assessment
After 4–8 conversational exchanges, when you have enough information to be genuinely helpful, transition into your assessment. Don't drag the conversation on unnecessarily. Say something like: "Based on what you've shared, here's my assessment for you..."

## Assessment JSON Format
When you're ready to provide your full assessment, end your message with EXACTLY this block (no text after it):

<ASSESSMENT>
{
  "condition": "Name of the likely condition",
  "overview": "2-3 sentences explaining what's happening and why",
  "severity": "mild",
  "urgency": "routine",
  "urgencyText": "No immediate rush — routine follow-up is fine",
  "medications": [
    {
      "name": "Medication name",
      "type": "otc",
      "dosage": "500mg",
      "frequency": "Every 6-8 hours as needed",
      "duration": "3-5 days",
      "instructions": "Take with food. Do not exceed 4g/day."
    }
  ],
  "homeRemedies": [
    "Rest and stay well-hydrated",
    "Warm salt water gargle if sore throat is present"
  ],
  "lifestyle": [
    "Get 7-9 hours of sleep to support immune function",
    "Avoid alcohol and smoking during recovery"
  ],
  "warnings": [
    "Seek medical care if fever exceeds 39.5°C (103°F)",
    "Go to the ER if you develop difficulty breathing"
  ],
  "followUp": "See your doctor if symptoms haven't improved in 5-7 days, or sooner if they worsen."
}
</ASSESSMENT>

## Severity values: "mild" | "moderate" | "severe"
## Urgency values: "routine" | "soon" | "immediate"
## Medication type values: "otc" (over-the-counter) | "prescription-consult" (needs a doctor's prescription)

## Important Rules
1. NEVER recommend controlled substances or prescription-only medications as first-line treatment
2. For prescription-consult medications, clearly state "You'll need a prescription for this — please see your doctor"
3. For emergencies (chest pain, stroke symptoms, severe allergic reaction, active suicidal ideation), lead with "Please call emergency services / 911 immediately" before anything else
4. Always be honest about the limits of AI health guidance
5. Include realistic, specific warnings about when to seek care
6. Do not provide a diagnosis — provide your "assessment" or "best understanding based on the information"`;

function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const userId = getUserIdFromToken(authHeader);

  if (!userId) {
    return res.status(401).json({ success: false, message: 'Please sign in to use the health chat' });
  }

  const { messages } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'Messages array is required' });
  }

  const apiKey = process.env.GeminiAPIKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      message: 'AI service is not configured. Please contact support.',
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        maxOutputTokens: 1500,
        temperature: 0.7,
      },
    });

    // Gemini expects a "history" of all turns except the last user message,
    // then the last user message is sent via sendMessage.
    const allTurns = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(m.content) }],
    }));

    const last = allTurns[allTurns.length - 1];
    const history = allTurns.slice(0, -1);

    // First turn must be from user — drop any leading model turns.
    while (history.length > 0 && history[0].role !== 'user') {
      history.shift();
    }

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(last.parts[0].text);
    const rawContent = result.response.text() || '';

    // Extract assessment JSON if present
    let assessment = null;
    const assessmentMatch = rawContent.match(/<ASSESSMENT>([\s\S]*?)<\/ASSESSMENT>/);
    if (assessmentMatch) {
      try {
        assessment = JSON.parse(assessmentMatch[1].trim());
      } catch (parseErr) {
        console.error('Failed to parse assessment JSON:', parseErr.message);
      }
    }

    // Strip the raw <ASSESSMENT> block from the visible message
    const visibleMessage = rawContent
      .replace(/<ASSESSMENT>[\s\S]*?<\/ASSESSMENT>/, '')
      .trim();

    return res.status(200).json({
      success: true,
      message: visibleMessage,
      assessment,
      isComplete: !!assessment,
    });
  } catch (err) {
    console.error('Chat API error:', err);

    const status = err.status || err.statusCode;
    if (status === 401 || status === 403) {
      return res.status(503).json({ success: false, message: 'AI service authentication failed' });
    }
    if (status === 429) {
      return res.status(429).json({ success: false, message: 'AI service is busy. Please try again in a moment.' });
    }

    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};
