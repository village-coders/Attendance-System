const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // Get token from header
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ message: 'No token, authorization denied' });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded;

    next();
  } catch (err) {
    res.status(401).json({ message: 'Token is not valid' });
  }
};

const isCoach = (req, res, next) => {
  if (req.user.role === 'coach') {
    console.log(req.user)
    return res.status(403).json({ message: 'Access denied. Only coach can mark attendance.' });
  }
  next();
};

module.exports = { authMiddleware, isCoach };