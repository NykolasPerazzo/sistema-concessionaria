const jwt = require("jsonwebtoken");

const authenticate = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      error: "Não autenticado.",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    return next();
  } catch (error) {
    return res.status(401).json({
      error: "Sessão inválida ou expirada.",
    });
  }
};

// Verifica se o usuário possui a permissão necessária
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // Primeiro precisa estar autenticado
    if (!req.user) {
      return res.status(401).json({
        error: "Não autenticado.",
      });
    }

    // Depois verificamos a role
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Você não tem permissão para realizar esta ação.",
      });
    }

    return next();
  };
};

module.exports = {
  authenticate,
  authorizeRoles,
};
