// pages/api/admin/settings.js
import dbConnect from '@/lib/dbConnect';
import Settings from '@/models/Settings';
import { withAuth } from '@/middleware/auth';

async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  await dbConnect();

  // GET - Settings fetch karo
  if (req.method === 'GET') {
    try {
      let settings = await Settings.findOne({});
      
      if (!settings) {
        // Default settings create karo
        settings = await Settings.create({
          companyName: 'Nexora',
          availabilityStatus: 'Available for new projects',
          tagline: 'We Build Digital Experiences That Matter',
          subheading: 'Premium Web Development, Custom Cloud Software, and AI-Powered Mobile Applications.',
          whatsappNumber: '',
          contactEmail: '',
          officeAddress: ''
        });
      }
      
      return res.status(200).json({ success: true, data: settings, settings });
    } catch (error) {
      console.error('GET Settings Error:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch settings',
        details: error.message 
      });
    }
  }

  // POST/PUT - Settings save karo
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      const {
        companyName,
        availabilityStatus,
        tagline,
        subheading,
        whatsappNumber,
        contactEmail,
        officeAddress
      } = req.body;

      console.log('📥 Received settings data:', {
        companyName,
        availabilityStatus,
        tagline,
        whatsappNumber,
        contactEmail,
        officeAddress
      });

      // Validation
      if (!companyName || !tagline) {
        return res.status(400).json({ 
          success: false, 
          error: 'Company name and tagline are required' 
        });
      }

      // Upsert - agar exist kare toh update, warna create
      const settings = await Settings.findOneAndUpdate(
        {},
        {
          companyName,
          availabilityStatus,
          tagline,
          subheading,
          whatsappNumber,
          contactEmail,
          officeAddress,
          updatedAt: new Date()
        },
        { 
          upsert: true, 
          new: true,
          runValidators: true
        }
      );

      console.log('✅ Settings saved:', settings);

      return res.status(200).json({ 
        success: true, 
        message: 'Settings saved successfully!',
        data: settings,
        settings 
      });
    } catch (error) {
      console.error('❌ SAVE Settings Error:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to save settings',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth ? withAuth(handler) : handler;
