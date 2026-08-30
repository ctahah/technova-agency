// pages/api/settings.js
import dbConnect from '@/lib/dbConnect';
import Settings from '@/models/Settings';

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
      let settings = await Settings.findOne({});
      
      if (!settings) {
        // Default settings
        settings = {
          companyName: 'Nexora',
          availabilityStatus: 'Available for new projects',
          tagline: 'We Build Digital Experiences That Matter',
          subheading: 'Premium Web Development, Custom Cloud Software, and AI-Powered Mobile Applications.',
          whatsappNumber: '',
          contactEmail: '',
          officeAddress: ''
        };
      }
      
      return res.status(200).json({ success: true, data: settings });
    } catch (error) {
      console.error('GET Settings Error:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch settings' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
