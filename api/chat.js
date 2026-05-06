// api/chat.js — Conversational AI health assessment via Anthropic Claude

const Anthropic = require('@anthropic-ai/sdk');
const jwt = require('jsonwebtoken');

const MEDICAL_SYSTEM_PROMPT = `You are a compassionate and knowledgeable medical AI assistant on the Healthcare platform. Your role is to help users understand their health concerns through natural, empathetic conversation.

## Your Conversation Style
- Be warm, caring, and professional — like a knowledgeable friend who happens to be a doctor
- Ask ONE or TWO follow-up questions at a time — never fire a list of questions
- Show genuine empathy: "I'm sorry to hear that", "That must be uncomfortable"
- Use plain language, avoid unnecessary jargon
- If the situation sounds like a medical emergency (chest pain, difficulty breathing, signs of stroke, severe bleeding), advise the user to call emergency services IMMEDIATELY

## Information to Gather (naturally, through conversation)
- Primary symptoms and when they started
- Severity (mild / moderate / severe)
- Any associated symptoms
- Duration and progression
- Relevant medical history (briefly)
- Current medications if relevant
- Age and basic context if it would meaningfully change the guidance

## When to Give Your Assessment
After 4–8 conversational exchanges, when you have enough information to be genuinely helpful, transition into your assessment. Say something like: "Based on what you've shared, here's my assessment for you..."

## Assessment JSON Format
When ready, end your message with EXACTLY this block (no text after it):

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
  "homeRemedies": ["Rest and stay well-hydrated"],
  "lifestyle": ["Get 7-9 hours of sleep to support immune function"],
  "warnings": ["Seek medical care if fever exceeds 39.5°C (103°F)"],
  "followUp": "See your doctor if symptoms haven't improved in 5-7 days."
}
</ASSESSMENT>

Severity: "mild"|"moderate"|"severe". Urgency: "routine"|"soon"|"immediate". Medication type: "otc"|"prescription-consult"

## Rules
1. NEVER recommend controlled substances as first-line treatment
2. For prescription-consult medications, state "You'll need a prescription — please see your doctor"
3. For emergencies, lead with "Please call emergency services / 911 immediately"
4. Always be honest about the limits of AI health guidance
5. Do not provide a diagnosis — provide your "assessment"`;

const FITNESS_SYSTEM_PROMPT = `You are a knowledgeable and motivating fitness coach AI on the Healthcare platform. Your role is to create personalized fitness plans.

## Fitness Assessment JSON Format
When you have gathered enough information (fitness goal, current level, training location, frequency, injuries, diet preferences), end your message with EXACTLY this block:

<FITNESS_ASSESSMENT>
{
  "goal": "Weight loss / Muscle gain / Endurance / Flexibility / General fitness",
  "level": "beginner|intermediate|advanced",
  "location": "home|gym|outdoor",
  "overview": "2-3 sentence personalized summary of the plan",
  "weeklyPlan": [
    {
      "day": "Monday",
      "focus": "Upper Body Strength",
      "exercises": [
        { "name": "Push-ups", "sets": 3, "reps": "12-15", "rest": "60s", "notes": "Keep core tight" }
      ],
      "duration": "45 min",
      "intensity": "moderate"
    }
  ],
  "nutritionTips": [
    "Eat 1.6-2g protein per kg bodyweight daily",
    "Stay hydrated — aim for 2-3 liters of water"
  ],
  "supplements": ["Whey protein (optional)", "Creatine monohydrate (optional)"],
  "lifestyle": ["Sleep 7-9 hours for optimal recovery", "Take rest days seriously"],
  "warnings": ["Stop if you feel sharp joint pain", "Consult a doctor before starting if you have medical conditions"],
  "coachNote": "Encouraging closing message to motivate the user"
}
</FITNESS_ASSESSMENT>

## Rules
- Be encouraging and motivating
- Tailor exercises to the user's level and location
- Always include at least 4 different workout days
- For injuries, modify exercises to avoid the problem area
- Include warm-up and cool-down reminders in notes`;

const SYSTEM_PROMPT = MEDICAL_SYSTEM_PROMPT;

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

  const { messages, mode } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ success: false, message: 'Messages array is required' });
  }

  const systemPrompt = mode === 'fitness' ? FITNESS_SYSTEM_PROMPT : MEDICAL_SYSTEM_PROMPT;

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      success: false,
      message: 'AI service is not configured. Please contact support.',
    });
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content),
      })),
    });

    const rawContent = response.content[0]?.text || '';

    // Extract assessment JSON if present (medical or fitness)
    let assessment = null;
    let assessmentType = null;

    const medMatch = rawContent.match(/<ASSESSMENT>([\s\S]*?)<\/ASSESSMENT>/);
    const fitMatch = rawContent.match(/<FITNESS_ASSESSMENT>([\s\S]*?)<\/FITNESS_ASSESSMENT>/);

    if (medMatch) {
      try { assessment = JSON.parse(medMatch[1].trim()); assessmentType = 'medical'; } catch (e) { console.error('Medical assessment parse error:', e.message); }
    } else if (fitMatch) {
      try { assessment = JSON.parse(fitMatch[1].trim()); assessmentType = 'fitness'; } catch (e) { console.error('Fitness assessment parse error:', e.message); }
    }

    // Strip the raw assessment blocks from the visible message
    const visibleMessage = rawContent
      .replace(/<ASSESSMENT>[\s\S]*?<\/ASSESSMENT>/, '')
      .replace(/<FITNESS_ASSESSMENT>[\s\S]*?<\/FITNESS_ASSESSMENT>/, '')
      .trim();

    return res.status(200).json({
      success: true,
      message: visibleMessage,
      assessment,
      assessmentType,
      isComplete: !!assessment,
    });
  } catch (err) {
    console.error('Chat API error:', err);

    if (err.status === 401) {
      return res.status(503).json({ success: false, message: 'AI service authentication failed' });
    }
    if (err.status === 429) {
      return res.status(429).json({ success: false, message: 'AI service is busy. Please try again in a moment.' });
    }

    return res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
};
