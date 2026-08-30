// pages/api/team.js
import dbConnect from '@/lib/dbConnect';
import Team from '@/models/Team';

export default async function handler(req, res) {
  await dbConnect();

  if (req.method === 'GET') {
    try {
      const teams = await Team.find({ isActive: true }).sort({ order: 1 });
      return res.status(200).json({ success: true, team: teams, data: teams });
    } catch (error) {
      console.error('GET /api/team error:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch team' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
