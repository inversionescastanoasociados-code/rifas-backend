module.exports = function apiKeyAuth(req, res, next) {
    try {
      const apiKey = req.headers['x-api-key'];
      const validKey = process.env.PUBLIC_API_KEY;
  
      if (!validKey) {
        return res.status(500).json({
          success: false,
          message: 'PUBLIC_API_KEY no configurada en el servidor'
        });
      }
  
      if (!apiKey || apiKey !== validKey) {
        return res.status(401).json({
          success: false,
          message: 'API key inválida'
        });
      }
  
      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error validando API key'
      });
    }
  };