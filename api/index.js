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
      details: initError.message,
      stack: initError.stack
    });
  }
  return app(req, res);
};
