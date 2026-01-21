import pool from '../config/db.js';
import axios from 'axios';

/**
 * Get geolocation data for an IP address
 * @param {string} ipAddress - The IP address to look up
 * @returns {Object} - Object containing country_code, region, city, or null values
 */
async function getGeolocationData(ipAddress) {
  if (!ipAddress) {
    return { country_code: null, region: null, city: null };
  }
  
  try {
    // Skip local/private IP addresses
    if (isPrivateIP(ipAddress)) {
      return { country_code: null, region: null, city: null };
    }
    
    // Check cache first
    const cacheResult = await pool.query(
      'SELECT country_code, region, city FROM geo_cache WHERE ip_address = $1',
      [ipAddress]
    );
    
    if (cacheResult.rows.length > 0) {
      return {
        country_code: cacheResult.rows[0].country_code,
        region: cacheResult.rows[0].region,
        city: cacheResult.rows[0].city
      };
    }
    
    // If not in cache, call ipgeolocation API
    const apiKey = process.env.IPGEO_API_KEY;
    if (!apiKey) {
      console.warn('IPGEO_API_KEY not configured, caching null values');
      await cacheGeolocationData(ipAddress, null, null, null);
      return { country_code: null, region: null, city: null };
    }
    
    const response = await axios.get(`https://api.ipgeolocation.io/ipgeo`, {
      params: {
        apiKey: apiKey,
        ip: ipAddress
      },
      timeout: 5000 // 5 second timeout
    });
    
    const result = response.data;
    
    // Extract geolocation data
    const geoData = {
      country_code: result.country_code2 || null,
      region: result.state_prov || null,
      city: result.city || null
    };
    
    // Cache the result
    await cacheGeolocationData(ipAddress, geoData.country_code, geoData.region, geoData.city);
    
    return geoData;
    
  } catch (error) {
    console.error('Error getting geolocation data:', error);
    
    // Cache null values to avoid repeated failed lookups
    await cacheGeolocationData(ipAddress, null, null, null);
    
    return { country_code: null, region: null, city: null };
  }
}

/**
 * Cache geolocation data in the database
 * @param {string} ipAddress - The IP address
 * @param {string} countryCode - The country code
 * @param {string} region - The region/state
 * @param {string} city - The city
 */
async function cacheGeolocationData(ipAddress, countryCode, region, city) {
  try {
    await pool.query(
      `INSERT INTO geo_cache (ip_address, country_code, region, city) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (ip_address) 
       DO UPDATE SET 
         country_code = EXCLUDED.country_code,
         region = EXCLUDED.region,
         city = EXCLUDED.city,
         updated_at = CURRENT_TIMESTAMP`,
      [ipAddress, countryCode, region, city]
    );
  } catch (error) {
    console.error('Error caching geolocation data:', error);
  }
}

/**
 * Check if an IP address is private/local
 * @param {string} ipAddress - The IP address to check
 * @returns {boolean} - True if the IP is private/local
 */
function isPrivateIP(ipAddress) {
  if (!ipAddress) return true;
  
  // Remove port if present
  const ip = ipAddress.split(':')[0];
  
  // Private IP ranges
  const privateRanges = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^127\./,                   // 127.0.0.0/8 (localhost)
    /^169\.254\./,              // 169.254.0.0/16 (link-local)
    /^::1$/,                    // IPv6 localhost
    /^fc00:/,                   // IPv6 unique local
    /^fe80:/                    // IPv6 link-local
  ];
  
  return privateRanges.some(range => range.test(ip));
}

/**
 * Extract the real IP address from request headers
 * @param {Object} req - Express request object
 * @returns {string|null} - The real IP address or null
 */
function getRealIP(req) {
  // Check various headers in order of preference
  const headers = [
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'x-forwarded',
    'x-cluster-client-ip',
    'forwarded-for',
    'forwarded'
  ];
  
  for (const header of headers) {
    const value = req.headers[header];
    if (value) {
      // Handle comma-separated values (take the first one)
      const ip = value.split(',')[0].trim();
      if (ip && !isPrivateIP(ip)) {
        return ip;
      }
    }
  }
  
  // Fallback to req.ip or connection remote address
  const fallbackIP = req.ip || (req.connection && req.connection.remoteAddress);
  return fallbackIP && !isPrivateIP(fallbackIP) ? fallbackIP : null;
}

export {
  getGeolocationData,
  getRealIP,
  isPrivateIP
}; 