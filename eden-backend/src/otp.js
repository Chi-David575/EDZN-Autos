const crypto = require('crypto');

function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

function otpMatches(stored, supplied) {
  const a = Buffer.from(String(stored || ''), 'utf8');
  const b = Buffer.from(String(supplied || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function logOtp(phone, code) {
  if (process.env.DEBUG_OTP === 'true') {
    console.log(`[OTP for ${phone}]: ${code}`);
  }
}

async function verifyUserOtp(pool, phone, otpCode) {
  const { rows } = await pool.query('select * from users where phone = $1', [phone]);
  const user = rows[0];
  if (!user) return { error: { status: 404, message: 'User not found.' } };
  if (!user.otp_code || !otpMatches(user.otp_code, String(otpCode))) {
    return { error: { status: 400, message: 'Invalid OTP code.' } };
  }
  if (!user.otp_expires_at || new Date() > new Date(user.otp_expires_at)) {
    return { error: { status: 400, message: 'OTP code has expired.' } };
  }
  const updated = await pool.query(
    'update users set is_verified = true, otp_code = null, otp_expires_at = null where id = $1 returning *',
    [user.id]
  );
  return { user: updated.rows[0] };
}

module.exports = { generateOTP, otpMatches, logOtp, verifyUserOtp };
