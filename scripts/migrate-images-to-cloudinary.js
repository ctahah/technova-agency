require('dotenv').config();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;

// Robust Cloudinary configuration
const parseAndConfigureCloudinary = () => {
  const rawUrl = process.env.CLOUDINARY_URL;
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const clean = rawUrl.trim().replace(/^['"]|['"]$/g, '');
  const match = clean.match(/^cloudinary:\/\/([^:]+):([^@]+)@([^/?#]+)/i);
  if (match) {
    cloudinary.config({
      api_key: match[1].trim(),
      api_secret: match[2].trim(),
      cloud_name: match[3].trim(),
      secure: true
    });
    return true;
  }
  try {
    process.env.CLOUDINARY_URL = clean;
    cloudinary.config(true);
    cloudinary.config({ secure: true });
    return Boolean(cloudinary.config().cloud_name);
  } catch (e) {
    return false;
  }
};
parseAndConfigureCloudinary();

async function runMigration() {
  const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--scan') || !process.env.CLOUDINARY_URL;

  console.log('================================================================');
  console.log(`☁️  TECHNOVA / NEXORA - CLOUDINARY IMAGE MIGRATION UTILITY ${isDryRun ? '(AUDIT / DRY-RUN MODE)' : '(LIVE MIGRATION MODE)'}`);
  console.log('================================================================\n');

  if (!process.env.CLOUDINARY_URL && !isDryRun) {
    console.error('❌ Error: CLOUDINARY_URL is not defined in your environment or .env file.');
    console.error('   Please set CLOUDINARY_URL=cloudinary://<key>:<secret>@<cloud_name> and run again.\n');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ Error: MONGODB_URI is not defined in your environment or .env file.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB Atlas...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB Atlas\n');

  const rootDir = path.resolve(__dirname, '..');
  const cloudConfig = cloudinary.config();
  if (process.env.CLOUDINARY_URL) {
    console.log(`☁️ Cloudinary Target Account: "${cloudConfig.cloud_name}"\n`);
  } else {
    console.log('ℹ️ Running in Scan/Audit mode. Provide CLOUDINARY_URL to perform live cloud migration.\n');
  }

  // Dynamic Schemas
  const Team = mongoose.models.Team || mongoose.model('Team', new mongoose.Schema({}, { strict: false }));
  const Service = mongoose.models.Service || mongoose.model('Service', new mongoose.Schema({}, { strict: false }));
  const Portfolio = mongoose.models.Portfolio || mongoose.model('Portfolio', new mongoose.Schema({}, { strict: false }));
  const Review = mongoose.models.Review || mongoose.model('Review', new mongoose.Schema({}, { strict: false }));

  const stats = {
    totalFound: 0,
    migrated: 0,
    alreadyCloudinary: 0,
    missingLocalFiles: [],
    errors: []
  };

  async function processCollection(name, Model, folderName, imageFields = ['image']) {
    console.log(`----------------------------------------------------------------`);
    console.log(`📁 Processing Collection: ${name}`);
    console.log(`----------------------------------------------------------------`);

    const docs = await Model.find().lean();
    for (const doc of docs) {
      for (const field of imageFields) {
        const val = doc[field];
        if (!val || typeof val !== 'string') continue;

        const trimmed = val.trim();

        // 1. Already Cloudinary
        if (trimmed.includes('cloudinary.com')) {
          stats.alreadyCloudinary++;
          console.log(`  ⚪ [ALREADY CLOUDINARY] ${doc.name || doc.title || doc._id} (${field}): ${trimmed}`);
          continue;
        }

        // 2. External standard URL (e.g. Unsplash or placeholder)
        if ((trimmed.startsWith('http://') || trimmed.startsWith('https://')) && !trimmed.includes('localhost')) {
          stats.alreadyCloudinary++;
          console.log(`  ⚪ [EXTERNAL URL] ${doc.name || doc.title || doc._id} (${field}): ${trimmed}`);
          continue;
        }

        // 3. Local /uploads/ or relative path
        if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
          stats.totalFound++;
          const relativePath = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
          const localFilePath = path.join(rootDir, relativePath);

          if (!fs.existsSync(localFilePath)) {
            stats.missingLocalFiles.push({
              collection: name,
              id: doc._id,
              name: doc.name || doc.title || 'Untitled',
              field,
              path: trimmed
            });
            console.log(`  ⚠️ [MISSING LOCAL FILE] ${doc.name || doc.title || doc._id}: "${localFilePath}"`);
            continue;
          }

          if (isDryRun) {
            stats.migrated++;
            console.log(`  🔍 [READY TO MIGRATE] ${doc.name || doc.title || doc._id}`);
            console.log(`     ↳ Local File: ${localFilePath}`);
            console.log(`     ↳ Target Cloudinary Folder: technova/${folderName}`);
            continue;
          }

          // File exists locally -> upload to Cloudinary
          try {
            console.log(`  ⏳ [UPLOADING] ${doc.name || doc.title || doc._id} -> Cloudinary...`);
            const uploadRes = await cloudinary.uploader.upload(localFilePath, {
              folder: `technova/${folderName}`,
              resource_type: 'image',
              overwrite: true
            });

            const updatePayload = {
              [field]: uploadRes.secure_url,
              imagePublicId: uploadRes.public_id
            };
            if (field === 'image' && doc.avatar !== undefined) {
              updatePayload.avatar = uploadRes.secure_url;
            }

            await Model.findByIdAndUpdate(doc._id, updatePayload);
            stats.migrated++;
            console.log(`  ✅ [MIGRATED] ${doc.name || doc.title || doc._id}`);
            console.log(`     ↳ Secure URL: ${uploadRes.secure_url}`);
            console.log(`     ↳ Public ID:  ${uploadRes.public_id}`);
          } catch (err) {
            stats.errors.push({
              collection: name,
              id: doc._id,
              error: err.message
            });
            console.error(`  ❌ [ERROR] Upload failed for ${doc._id}:`, err.message);
          }
        }
      }
    }
  }

  // Run for each collection
  await processCollection('Team', Team, 'team', ['image']);
  await processCollection('Services', Service, 'services', ['image']);
  await processCollection('Portfolio', Portfolio, 'projects', ['image']);
  await processCollection('Reviews', Review, 'reviews', ['image', 'avatar']);

  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log('📊 MIGRATION SUMMARY & REPORT');
  console.log('================================================================');
  console.log(`- Total Legacy Image Records Found: ${stats.totalFound}`);
  console.log(`- Successfully Migrated to Cloudinary: ${stats.migrated}`);
  console.log(`- Already Cloudinary / External URLs: ${stats.alreadyCloudinary}`);
  console.log(`- Missing Local Source Files: ${stats.missingLocalFiles.length}`);
  console.log(`- Errors: ${stats.errors.length}`);

  if (stats.missingLocalFiles.length > 0) {
    console.log('\n⚠️  Missing Local Source Files Detail:');
    stats.missingLocalFiles.forEach(item => {
      console.log(`  * [${item.collection}] "${item.name}" (ID: ${item.id}) -> Path: ${item.path}`);
    });
  }

  if (stats.errors.length > 0) {
    console.log('\n❌ Error Details:');
    stats.errors.forEach(err => {
      console.log(`  * [${err.collection}] ID: ${err.id} -> ${err.error}`);
    });
  }

  console.log('\n🌟 Migration process completed.\n');
}

if (require.main === module) {
  runMigration().catch(err => {
    console.error('Fatal Migration Error:', err);
    process.exit(1);
  });
}

module.exports = { runMigration };
