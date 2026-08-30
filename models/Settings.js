// models/Settings.js
const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  companyName: {
    type: String,
    default: 'Nexora'
  },
  availabilityStatus: {
    type: String,
    default: 'Available for new projects'
  },
  tagline: {
    type: String,
    default: 'We Build Digital Experiences That Matter'
  },
  subheading: {
    type: String,
    default: 'Premium Web Development, Custom Cloud Software, and AI-Powered Mobile Applications.'
  },
  whatsappNumber: {
    type: String,
    default: ''
  },
  contactEmail: {
    type: String,
    default: ''
  },
  officeAddress: {
    type: String,
    default: ''
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Sirf ek settings document hona chahiye
const Settings = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);

module.exports = Settings;
