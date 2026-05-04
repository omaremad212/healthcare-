// api/health.js - Vercel Serverless API

export default async function handler(req, res) {
  res.status(200).json({ success: true, message: 'Healthcare API is running' });
}