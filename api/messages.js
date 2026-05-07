// api/messages.js — Patient ↔ professional chat tied to a booking

const jwt = require('jsonwebtoken');
const Groq = require('groq-sdk');
const { supabase } = require('../lib/supabase');

function getUserIdFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'secret123');
    return decoded.id;
  } catch (e) { return null; }
}

function isGymBooking(booking) {
  const name = String(booking.doctor_name || '');
  return /^gym\s*[:\-]/i.test(name);
}

function inferRole(booking) {
  const name = String(booking.doctor_name || '').toLowerCase();
  if (name.startsWith('coach ')) return 'coach';
  return 'doctor';
}

function buildAISystemPrompt(role, professionalName, patientTurns) {
  const shouldDeliverPlan = patientTurns >= 4;
  if (role === 'coach') {
    return `You are ${professionalName}, a fitness coach following up with your client via secure chat after they booked a session with you.

Style:
- Warm, motivating, knowledgeable but concise (2-4 sentences per reply).
- Reference what the client tells you (goals, level, equipment, injuries).
- Ask ONE focused question at a time. Do not interrogate.
- Never break character. You ARE ${professionalName}, not an AI.

${shouldDeliverPlan ? `IMPORTANT: You have enough information now. In THIS reply, deliver the full personalized training plan in this exact markdown format and nothing else after it:

**Training Plan**

**Goal:** <client's goal>
**Level:** <beginner|intermediate|advanced>

**Weekly Schedule:**
- Monday — <focus>: <2-4 exercises with sets x reps>
- Tuesday — <focus>: ...
- Wednesday — <focus>: ...
- Thursday — <focus>: ...
- Friday — <focus>: ...

**Nutrition Tips:**
- <tip 1>
- <tip 2>
- <tip 3>

**Recovery:** <rest, sleep, hydration guidance>

**Warnings:** <safety / injury cautions>

Close with a one-line motivating note signed "- ${professionalName}".` : `Continue gathering: goal, current level, location/equipment, days/week, injuries. After 4-5 exchanges, deliver a full plan.`}`;
  }
  const cleanName = professionalName.replace(/^Dr\.?\s*/i, '');
  return `You are Dr. ${cleanName}, a licensed physician following up with your patient via secure chat after their booked consultation.

Style:
- Warm, professional, decisive. 2-4 sentences per reply.
- Ask ONE focused clinical question at a time.
- Use plain language; briefly explain medical terms when needed.
- Never break character. You ARE the doctor, not an AI.
- If the patient describes a true emergency (chest pain with sweating, stroke signs, severe bleeding, suicidal intent, anaphylaxis), tell them to call emergency services immediately.

${shouldDeliverPlan ? `IMPORTANT: You have enough information now. In THIS reply, deliver the complete treatment plan in this exact markdown format and nothing else after it:

**Treatment Plan**

**Working Diagnosis:** <condition>
**Severity:** <mild|moderate|severe>

**Medications:**
- <generic name (brand)> - <dose> <frequency> for <duration>. <key caution>
- <next med if needed>

**Home Care:**
- <remedy 1>
- <remedy 2>

**Lifestyle:**
- <tip 1>
- <tip 2>

**Red Flags - seek urgent care if:**
- <warning 1>
- <warning 2>

**Follow-up:** <when to check back, e.g. "Message me in 5 days if no improvement.">

Close with a reassuring one-line note signed "- Dr. ${cleanName}".` : `Continue gathering: primary symptom + onset, severity, associated symptoms, relevant history, allergies. After 4-5 exchanges, deliver the full plan.`}`;
}

async function generateAIReply(booking, role, conversation) {
  const apiKey = process.env.GROQ_API_KEY || process.env.GroqAPIKey;
  if (!apiKey) return null;

  const patientTurns = conversation.filter(m => m.sender_role === 'patient').length;
  const profName = booking.doctor_name || (role === 'coach' ? 'Coach' : 'Doctor');
  const systemPrompt = buildAISystemPrompt(role, profName, patientTurns);

  const chatMessages = [
    { role: 'system', content: systemPrompt },
    ...conversation.slice(-12).map(m => ({
      role: m.sender_role === 'patient' ? 'user' : 'assistant',
      content: String(m.body || ''),
    })),
  ];

  try {
    const groq = new Groq({ apiKey });
    const response = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: chatMessages,
      max_tokens: 900,
      temperature: 0.7,
    });
    const reply = response?.choices?.[0]?.message?.content?.trim();
    return reply || null;
  } catch (e) {
    console.error('[messages] AI reply failed:', e?.message || e);
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const userId = getUserIdFromToken(req.headers.authorization);
  if (!userId) return res.status(401).json({ success: false, message: 'Not authorized' });

  // Confirm role of the requester
  const { data: me } = await supabase
    .from('users').select('id, name, display_name, role').eq('id', userId).single();
  if (!me) return res.status(401).json({ success: false, message: 'User not found' });

  const isProfessional = me.role === 'doctor' || me.role === 'coach';

  // ───── GET — list messages for a booking, or list threads for the user ─────
  if (req.method === 'GET') {
    const bookingId = req.query.booking_id;

    // List threads (one entry per booking the user is part of)
    if (req.query.action === 'threads') {
      let bookingsQuery = supabase
        .from('bookings')
        .select('id, doctor_id, doctor_name, professional_role, date, time_slot, status, user_id')
        .order('created_at', { ascending: false })
        .limit(50);
      if (isProfessional) {
        bookingsQuery = bookingsQuery.eq('doctor_id', userId);
      } else {
        bookingsQuery = bookingsQuery.eq('user_id', userId);
      }
      const { data: bookings, error: bErr } = await bookingsQuery;
      if (bErr) return res.status(500).json({ success: false, message: bErr.message });

      const ids = (bookings || []).map(b => b.id);
      let threadMeta = {};
      if (ids.length) {
        const { data: msgs } = await supabase
          .from('messages').select('booking_id, body, created_at, sender_role')
          .in('booking_id', ids).order('created_at', { ascending: false });
        (msgs || []).forEach(m => {
          if (!threadMeta[m.booking_id]) threadMeta[m.booking_id] = m;
        });
      }
      return res.status(200).json({
        success: true,
        data: (bookings || []).map(b => ({
          booking_id: b.id,
          doctor_name: b.doctor_name,
          professional_role: b.professional_role,
          date: b.date,
          time_slot: b.time_slot,
          last_message: threadMeta[b.id]?.body || null,
          last_message_at: threadMeta[b.id]?.created_at || null,
        })),
      });
    }

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'booking_id is required' });
    }

    // Verify the user is part of this booking
    const { data: booking } = await supabase
      .from('bookings').select('id, user_id, doctor_id, doctor_name')
      .eq('id', bookingId).single();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    const isOwner = booking.user_id === userId;
    const isPro   = isProfessional && booking.doctor_id === userId;
    if (!isOwner && !isPro) {
      return res.status(403).json({ success: false, message: 'Not authorized for this conversation' });
    }

    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, sender_role, body, created_at, professional_name')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) return res.status(500).json({ success: false, message: error.message });

    return res.status(200).json({
      success: true,
      data: messages || [],
      booking: {
        id: booking.id,
        doctor_name: booking.doctor_name,
      },
    });
  }

  // ───── POST — send a message ─────
  if (req.method === 'POST') {
    try {
      const { booking_id, body } = req.body || {};
      if (!booking_id) return res.status(400).json({ success: false, message: 'booking_id is required' });
      const trimmed = String(body || '').trim();
      if (trimmed.length < 1) return res.status(400).json({ success: false, message: 'Message cannot be empty' });
      if (trimmed.length > 2000) return res.status(400).json({ success: false, message: 'Message too long (max 2000 chars)' });

      const { data: booking } = await supabase
        .from('bookings').select('id, user_id, doctor_id, doctor_name')
        .eq('id', booking_id).single();
      if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });

      const isOwner = booking.user_id === userId;
      const isPro   = isProfessional && booking.doctor_id === userId;
      if (!isOwner && !isPro) {
        return res.status(403).json({ success: false, message: 'Not authorized for this conversation' });
      }

      const senderRole = isPro ? 'professional' : 'patient';
      const { data: msg, error } = await supabase
        .from('messages')
        .insert({
          booking_id,
          patient_id: booking.user_id,
          professional_id: booking.doctor_id || null,
          professional_name: booking.doctor_name,
          sender_role: senderRole,
          body: trimmed,
          read_by_patient: senderRole === 'patient',
          read_by_professional: senderRole === 'professional',
        })
        .select()
        .single();
      if (error) return res.status(500).json({ success: false, message: error.message });

      // If a patient sent the message, generate an AI reply playing the role of
      // the booked professional. Skip for gym bookings (no professional to roleplay).
      if (senderRole === 'patient' && !isGymBooking(booking)) {
        const role = inferRole(booking);
        const { data: history } = await supabase
          .from('messages')
          .select('sender_role, body, created_at')
          .eq('booking_id', booking_id)
          .order('created_at', { ascending: true })
          .limit(40);
        const aiBody = await generateAIReply(booking, role, history || []);
        if (aiBody) {
          await supabase.from('messages').insert({
            booking_id,
            patient_id: booking.user_id,
            professional_id: booking.doctor_id || null,
            professional_name: booking.doctor_name,
            sender_role: 'professional',
            body: aiBody,
            read_by_patient: false,
            read_by_professional: true,
          });
        }
      }

      return res.status(201).json({ success: true, data: msg });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
};
