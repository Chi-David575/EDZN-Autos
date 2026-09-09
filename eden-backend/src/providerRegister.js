const bcrypt = require('bcrypt');
const { generateOTP, logOtp } = require('./otp');

async function resolveOrCreateUser(pool, { name, phone, email, password, role, locationLabel }) {
  const existing = await pool.query('select * from users where phone = $1', [phone]);
  const otpCode = generateOTP();
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

  if (existing.rows[0]) {
    const user = existing.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      const err = new Error('An account with this phone already exists. Use the correct password.');
      err.status = 400;
      throw err;
    }
    if (!user.is_verified) {
      await pool.query('update users set otp_code=$1, otp_expires_at=$2 where id=$3', [
        otpCode,
        otpExpiresAt,
        user.id
      ]);
      logOtp(phone, otpCode);
    }
    return { userId: user.id, otpRequired: !user.is_verified };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userResult = await pool.query(
    `INSERT INTO users (name, phone, email, password_hash, role, location_label, otp_code, otp_expires_at, is_verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)
     RETURNING id`,
    [name, phone, email || null, passwordHash, role, locationLabel || 'Not shared', otpCode, otpExpiresAt]
  );
  logOtp(phone, otpCode);
  return { userId: userResult.rows[0].id, otpRequired: true };
}

module.exports = { resolveOrCreateUser };
