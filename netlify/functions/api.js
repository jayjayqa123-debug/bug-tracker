// Netlify entry point. Wraps the same Express app that Vercel uses (api/index.js).
// Nothing here affects the Vercel deployment.
process.env.NETLIFY_RUNTIME = '1';
const serverless = require('serverless-http');
const app = require('../../server');

// Netlify may deliver the path as /.netlify/functions/api/... or the original /api/...;
// serverless-http hands Express whatever it receives, so normalise both to /api/...
module.exports.handler = serverless(app, {
  request(req) {
    if (req.url.startsWith('/.netlify/functions/api')) {
      req.url = '/api' + req.url.slice('/.netlify/functions/api'.length);
    }
  }
});