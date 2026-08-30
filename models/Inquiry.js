const mongoose = require('mongoose');

const InquirySchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, default: '' },
  phone: { type: String, default: '' },
  service: { type: String, default: '' },
  budget: { type: String, default: '' },
  message: { type: String, default: '' },
  status: { type: String, default: 'new' },
  date: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.Inquiry || mongoose.model('Inquiry', InquirySchema);
