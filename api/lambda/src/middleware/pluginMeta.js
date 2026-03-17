// Middleware to add plugin metadata to API responses when the plugin is out of date.
//
// The plugin sends an `X-Plugin-Meta` header containing JSON like:
//   { "latestVersion": "1.2.3" }
//
// The API reads `process.env.PLUGIN_META` (JSON) and compares:
//   currentVersion (API) vs latestVersion (plugin)
//
// If API currentVersion is greater than plugin latestVersion, it intercepts
// successful JSON responses (2xx/3xx) and adds:
//   meta.plugin = { latestVersion: currentVersion, minSupportedVersion }

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const compareSemver = (a = '', b = '') => {
  const normalize = (v) => v.split('.').map((p) => Number(p) || 0);
  const aParts = normalize(a);
  const bParts = normalize(b);
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }
  return 0;
};

const pluginMetaEnv = (() => {
  const raw = process.env.PLUGIN_META;
  if (!raw) return null;
  const parsed = parseJson(raw);
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    currentVersion: String(parsed.currentVersion || ''),
    minSupportedVersion: String(parsed.minSupportedVersion || ''),
  };
})();

export const pluginMetaMiddleware = (req, res, next) => {
  if (!pluginMetaEnv) return next();

  const headerValue = req.get('X-Plugin-Meta');
  if (!headerValue) return next();

  const headerJson = parseJson(headerValue);
  if (!headerJson || typeof headerJson !== 'object') return next();

  const latestVersion = String(headerJson.latestVersion || '');
  if (!latestVersion) return next();

  // Only compare when the API is ahead of the plugin.
  if (compareSemver(pluginMetaEnv.currentVersion, latestVersion) <= 0) return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const statusCode = res.statusCode || 200;
    if (statusCode >= 200 && statusCode < 400 && body && typeof body === 'object' && !Buffer.isBuffer(body)) {
      const cloned = { ...body };
      cloned.meta = {
        ...cloned.meta,
        plugin: {
          latestVersion: pluginMetaEnv.currentVersion,
          minSupportedVersion: pluginMetaEnv.minSupportedVersion,
        },
      };
      return originalJson(cloned);
    }
    return originalJson(body);
  };

  return next();
};
