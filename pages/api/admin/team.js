// pages/api/admin/team.js
import dbConnect from '@/lib/dbConnect';
import Team from '@/models/Team';
import { withAuth } from '@/middleware/auth';

async function handler(req, res) {
  await dbConnect();

  if (req.method === 'GET') {
    try {
      const teams = await Team.find({ isActive: true }).sort({ order: 1 });
      return res.status(200).json({ success: true, data: teams });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Failed to fetch team' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, role, description, whatsappNumber, image, order, isFeatured } = req.body;

      if (!name || !role || !whatsappNumber) {
        return res.status(400).json({ success: false, error: 'Name, role and WhatsApp number are required' });
      }

      const team = await Team.create({
        name,
        role,
        description,
        whatsappNumber,
        image: image || 'https://via.placeholder.com/150',
        order: order || 0,
        isFeatured: isFeatured || false  // 🔴 NEW
      });

      return res.status(201).json({ success: true, data: team });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Failed to create team member' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { id, name, role, description, whatsappNumber, image, order, isFeatured } = req.body;
      const targetId = id || req.query?.id;

      const team = await Team.findByIdAndUpdate(
        targetId,
        { name, role, description, whatsappNumber, image, order, isFeatured },  // 🔴 isFeatured added
        { new: true }
      );

      if (!team) {
        return res.status(404).json({ success: false, error: 'Team member not found' });
      }

      return res.status(200).json({ success: true, data: team });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Failed to update team member' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const targetId = req.body?.id || req.query?.id;

      const team = await Team.findByIdAndUpdate(
        targetId,
        { isActive: false },
        { new: true }
      );

      if (!team) {
        return res.status(404).json({ success: false, error: 'Team member not found' });
      }

      return res.status(200).json({ success: true, message: 'Team member deleted' });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Failed to delete team member' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth(handler);
