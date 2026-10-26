let app;
let initError = null;

try {
  app = require('../server/app');
} catch (err) {
  console.error('Failed to initialize server/app:', err);
  initError = err;
}

module.exports = (req, res) => {
  if (initError) {
    return res.status(500).json({
      success: false,
      error: 'خادم النظام قيد التهيئة السحابية أو حدث خطأ داخلي',
      details: initError.message
    });
  }

  // Ensure req.url preserves /api prefix expected by Express routers
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  return app(req, res);
};
