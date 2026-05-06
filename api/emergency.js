// api/emergency.js — Emergency hotlines, hospitals, first-aid

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const hotlines = [
    { name: 'Emergency Services',   number: '911',  description: 'Police, Fire, Ambulance — life-threatening emergencies', icon: 'fa-truck-medical' },
    { name: 'Ambulance (Egypt)',    number: '123',  description: 'Egyptian Ambulance Service',                             icon: 'fa-truck-medical' },
    { name: 'Poison Control',       number: '+1-800-222-1222', description: '24/7 poison emergencies and information',     icon: 'fa-skull-crossbones' },
    { name: 'Mental Health Crisis', number: '988',  description: 'Suicide & Crisis Lifeline — 24/7 confidential support',  icon: 'fa-brain' },
    { name: 'Domestic Violence',    number: '1-800-799-7233', description: 'National Domestic Violence Hotline',           icon: 'fa-shield-heart' },
  ];

  const hospitals = [
    { name: 'Cairo University Hospital',      address: '1 Al-Saray Street, Manial, Cairo',     phone: '+20 2 2365 8000', distance: '2.4 km', open24h: true },
    { name: 'Dar Al Fouad Hospital',          address: '6th October City, Giza',                phone: '+20 2 3835 6030', distance: '8.1 km', open24h: true },
    { name: 'Cleopatra Hospital',              address: 'Heliopolis, Cairo',                     phone: '+20 2 2414 3931', distance: '5.6 km', open24h: true },
    { name: 'Misr International Hospital',     address: 'Dokki, Giza',                           phone: '+20 2 3760 8261', distance: '3.9 km', open24h: true },
    { name: 'As-Salam International Hospital', address: 'Corniche El Nile, Maadi, Cairo',        phone: '+20 2 2524 0250', distance: '6.2 km', open24h: true },
  ];

  const firstAid = [
    {
      title: 'Heart Attack',
      icon: 'fa-heart-pulse',
      severity: 'critical',
      steps: [
        'Call 911 immediately. Do not drive yourself.',
        'Have the person sit down, rest, and try to keep calm.',
        'Loosen any tight clothing.',
        'If the person is not allergic, give one regular aspirin (325mg) to chew.',
        'If the person becomes unresponsive and is not breathing, begin CPR.',
      ],
    },
    {
      title: 'Stroke',
      icon: 'fa-brain',
      severity: 'critical',
      steps: [
        'Use the F.A.S.T. test: Face drooping, Arm weakness, Speech difficulty, Time to call 911.',
        'Note the time symptoms started — this is critical for treatment.',
        'Do not give the person anything to eat or drink.',
        'Have them lie down with head and shoulders slightly elevated.',
      ],
    },
    {
      title: 'Choking (Adult)',
      icon: 'fa-lungs',
      severity: 'critical',
      steps: [
        'Ask "Are you choking?" If they cannot speak or cough, act fast.',
        'Stand behind them and give 5 firm back blows between the shoulder blades.',
        'Perform 5 abdominal thrusts (Heimlich maneuver).',
        'Alternate back blows and abdominal thrusts until the object is expelled.',
        'If they become unconscious, call 911 and start CPR.',
      ],
    },
    {
      title: 'Severe Bleeding',
      icon: 'fa-droplet',
      severity: 'critical',
      steps: [
        'Call 911 if bleeding is severe or will not stop.',
        'Apply firm, direct pressure with a clean cloth or bandage.',
        'Keep pressing — do not lift to check for 5 minutes.',
        'If blood soaks through, add another layer on top — do not remove the first.',
        'Elevate the wound above the heart if possible.',
      ],
    },
    {
      title: 'Burns',
      icon: 'fa-fire',
      severity: 'high',
      steps: [
        'Cool the burn under cool (not cold) running water for at least 10 minutes.',
        'Remove jewelry or tight clothing near the burn before swelling starts.',
        'Cover loosely with a clean, non-stick bandage or cling film.',
        'Do not apply ice, butter, or ointments.',
        'For burns larger than your palm, electrical burns, or chemical burns, call 911.',
      ],
    },
    {
      title: 'Allergic Reaction (Anaphylaxis)',
      icon: 'fa-virus',
      severity: 'critical',
      steps: [
        'Call 911 immediately if signs of anaphylaxis: trouble breathing, swollen face/throat, hives, weak pulse.',
        'Use an epinephrine auto-injector (EpiPen) if available — into the outer thigh.',
        'Have the person lie flat with legs elevated.',
        'If breathing stops, begin CPR.',
        'Even if symptoms improve, get to the hospital — symptoms can return.',
      ],
    },
  ];

  return res.status(200).json({
    success: true,
    data: {
      hotlines,
      hospitals,
      firstAid,
      warning: 'If you are facing a life-threatening emergency, call emergency services IMMEDIATELY. Do not rely on the chatbot or wait for online help.',
    },
  });
};
