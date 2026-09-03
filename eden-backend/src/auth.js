const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  // Get token from the Authorization header (Expected format: "Bearer <token>")
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  // Verify the token using your secret from the .env file
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    
    // Attach the decoded user data (like userId) to the request object
    req.user = user;
    next();
  });
}

module.exports = { authenticateToken };