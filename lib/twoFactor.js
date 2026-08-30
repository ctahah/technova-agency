// lib/twoFactor.js
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

/**
 * Generate a new 2FA TOTP secret and QR code for Google Authenticator
 * @param {string} accountName - e.g. 'Nexora Admin (admin@technova.app)'
 */
async function generate2FASecret(accountName = 'Nexora Admin') {
  const secret = speakeasy.generateSecret({
    name: accountName,
    issuer: 'Nexora'
  });

  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

  return {
    secretBase32: secret.base32,
    otpauthUrl: secret.otpauth_url,
    qrCode: qrCodeDataUrl
  };
}

/**
 * Verify a 6-digit TOTP code against the stored secret
 * @param {string} secretBase32 - User's 2FA secret (base32)
 * @param {string} token - 6-digit token entered by user
 * @param {number} window - Time window tolerance (default: 1 step = ±30s)
 */
function verify2FACode(secretBase32, token, window = 1) {
  if (!secretBase32 || !token) return false;

  return speakeasy.totp.verify({
    secret: secretBase32,
    encoding: 'base32',
    token: token.toString().trim(),
    window: window
  });
}

module.exports = {
  generate2FASecret,
  verify2FACode
};
