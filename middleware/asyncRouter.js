const express = require('express');
function asyncRouter() {
  const router = express.Router();
  for (const method of ['get', 'post', 'put', 'delete', 'patch']) {
    const original = router[method].bind(router);
    router[method] = (path, ...handlers) =>
      original(path, ...handlers.map(h => (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)));
  }
  return router;
}
module.exports = asyncRouter;
