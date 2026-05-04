// api/dashboard.js - Vercel Serverless API

global.chatbotResults = global.chatbotResults || [];
global.bookings = global.bookings || [];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorized' });
  }

  try {
    // Return mock dashboard data based on user role
    // In production, this would fetch real user data from DB
    const dashboardData = {
      success: true,
      data: {
        profile: {
          id: 'user_1',
          name: 'User',
          email: 'user@example.com',
          role: 'patient'
        },
        latestResult: global.chatbotResults.length > 0 ? global.chatbotResults[global.chatbotResults.length - 1] : null,
        chatbotHistory: global.chatbotResults.slice(-5).reverse(),
        bookings: global.bookings.slice(-10).reverse(),
        stats: {
          totalBookings: global.bookings.length,
          totalOrders: 0,
          assessments: global.chatbotResults.length
        }
      }
    };

    res.status(200).json(dashboardData);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}