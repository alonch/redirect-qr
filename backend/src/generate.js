const AWS = require('aws-sdk');

// Configure the AWS SDK
// Set AWS_SDK_LOAD_CONFIG=1 to load config from shared credentials file
process.env.AWS_SDK_LOAD_CONFIG = 1;

// Configure AWS SDK with explicit region
AWS.config.update({ 
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();

const generateUniqueCode = () => {
  // Generate a random 6-character alphanumeric code
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

exports.handler = async function (req) {
  try {
    // Generate a new unique code
    let code = generateUniqueCode();
    let unique = false;
    
    // Ensure uniqueness (retry if collision)
    while (!unique) {
      try {
        await dynamoDB.put({
          TableName: 'QRRegistrations',
          Item: {
            code: code,
            assigned: false,
            createdAt: new Date().toISOString()
          },
          ConditionExpression: 'attribute_not_exists(code)'
        }).promise();
        unique = true;
      } catch (error) {
        if (error.code === 'ConditionalCheckFailedException') {
          // Code already exists, try a new one
          code = generateUniqueCode();
        } else {
          console.error('DynamoDB Error:', error);
          throw error;
        }
      }
    }

    // Construct the full URL for the QR code
    const baseUrl = process.env.BASE_URL || 'https://example.com';
    const qrUrl = `${baseUrl}/qr/${code}`;

    return {
      status: 200,
      body: {
        code: code,
        url: qrUrl
      }
    };
  } catch (error) {
    console.error('Error generating QR code:', error);
    return {
      status: 500,
      body: {
        error: 'Failed to generate QR code',
        message: error.message
      }
    };
  }
}; 