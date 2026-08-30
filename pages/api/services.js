// pages/api/services.js
import dbConnect from '@/lib/dbConnect';
import Service from '@/models/Service';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  await dbConnect();

  if (req.method === 'GET') {
    try {
      const services = await Service.find({ isActive: true }).sort({ order: 1 });
      return res.status(200).json({ success: true, data: services });
    } catch (error) {
      console.error('GET Public Services Error:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch services' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
