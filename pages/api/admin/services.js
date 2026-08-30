// pages/api/admin/services.js
import dbConnect from '@/lib/dbConnect';
import Service from '@/models/Service';
import { withAuth } from '@/middleware/auth';

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  await dbConnect();

  // GET - All services
  if (req.method === 'GET') {
    try {
      const services = await Service.find({ isActive: true }).sort({ order: 1 });
      return res.status(200).json({ success: true, data: services, services });
    } catch (error) {
      console.error('GET Services Error:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch services' });
    }
  }

  // POST - Add new service
  if (req.method === 'POST') {
    try {
      const { title, description, icon, price, badge, category, features, order } = req.body;

      console.log('📥 Creating service:', { title, description, icon, price, badge });

      if (!title || !description) {
        return res.status(400).json({ success: false, error: 'Title and description are required' });
      }

      const service = await Service.create({
        title,
        description,
        icon: icon || 'code',
        price: price || '',
        badge: badge || category || '',
        features: Array.isArray(features) ? features : (typeof features === 'string' ? features.split(',').map(f => f.trim()) : []),
        order: order || 0
      });

      console.log('✅ Service created:', service._id);
      return res.status(201).json({ success: true, data: service, service });
    } catch (error) {
      console.error('❌ CREATE Service Error:', error);
      return res.status(500).json({ success: false, error: 'Failed to create service', details: error.message });
    }
  }

  // PUT - Update service
  if (req.method === 'PUT') {
    try {
      const { id, title, description, icon, price, badge, category, features, order } = req.body;
      const targetId = id || req.query.id;

      if (!targetId) {
        return res.status(400).json({ success: false, error: 'Service ID is required' });
      }

      const service = await Service.findByIdAndUpdate(
        targetId,
        { 
          title, 
          description, 
          icon, 
          price, 
          badge: badge || category || '', 
          features: Array.isArray(features) ? features : (typeof features === 'string' ? features.split(',').map(f => f.trim()) : undefined), 
          order 
        },
        { new: true, runValidators: true }
      );

      if (!service) {
        return res.status(404).json({ success: false, error: 'Service not found' });
      }

      console.log('✅ Service updated:', targetId);
      return res.status(200).json({ success: true, data: service, service });
    } catch (error) {
      console.error('❌ UPDATE Service Error:', error);
      return res.status(500).json({ success: false, error: 'Failed to update service' });
    }
  }

  // DELETE - Soft delete service
  if (req.method === 'DELETE') {
    try {
      const targetId = (req.body && req.body.id) || req.query.id;

      if (!targetId) {
        return res.status(400).json({ success: false, error: 'Service ID is required' });
      }

      const service = await Service.findByIdAndUpdate(
        targetId,
        { isActive: false },
        { new: true }
      );

      if (!service) {
        return res.status(404).json({ success: false, error: 'Service not found' });
      }

      console.log('✅ Service deleted:', targetId);
      return res.status(200).json({ success: true, message: 'Service deleted' });
    } catch (error) {
      console.error('❌ DELETE Service Error:', error);
      return res.status(500).json({ success: false, error: 'Failed to delete service' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withAuth ? withAuth(handler) : handler;
