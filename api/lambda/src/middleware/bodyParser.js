/**
 * Body parser middleware for AWS Lambda/API Gateway
 * Handles Buffer objects that come from API Gateway and converts them to parsed JSON
 */
const bodyParser = (req, res, next) => {
  try {
    // Check if req.body is a Buffer (common in Lambda/API Gateway)
    if (req.body && Buffer.isBuffer(req.body)) {
      // Convert Buffer to string and parse as JSON
      const bodyString = req.body.toString('utf8');
      req.body = JSON.parse(bodyString);
    }
    // If it's already an object with type: "Buffer" and data array
    else if (req.body && typeof req.body === 'object' &&
             req.body.type === 'Buffer' && Array.isArray(req.body.data)) {
      // Convert the data array back to Buffer, then to string, then parse
      const buffer = Buffer.from(req.body.data);
      const bodyString = buffer.toString('utf8');
      req.body = JSON.parse(bodyString);
    }

    next();
  } catch (error) {
    console.error('Body parsing error:', error);
    // If parsing fails, continue with original body to not break existing functionality
    next();
  }
};

module.exports = { bodyParser };
