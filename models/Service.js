// models/Service.js
import mongoose from 'mongoose';

const ServiceSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    default: 'code' // code, mobile, brain, cloud, shield, palette
  },
  price: {
    type: String,
    default: ''
  },
  badge: {
    type: String,
    default: '' // POPULAR, HIGH DEMAND, TRENDING, etc.
  },
  features: {
    type: [String],
    default: []
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

export default mongoose.models.Service || mongoose.model('Service', ServiceSchema);
