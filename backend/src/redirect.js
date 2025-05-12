const AWS = require('aws-sdk');

// Configure the AWS SDK
// Set AWS_SDK_LOAD_CONFIG=1 to load config from shared credentials file
process.env.AWS_SDK_LOAD_CONFIG = 1;

// Configure AWS SDK with explicit region
AWS.config.update({ 
  region: process.env.AWS_REGION || 'us-east-1'
});

const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async function (req) {
  try {
    // Get code from URL parameters
    const code = req.params.code;
    
    if (!code) {
      return {
        status: 400,
        body: {
          error: 'Missing QR code parameter'
        }
      };
    }

    // Look up the code in DynamoDB
    const result = await dynamoDB.get({
      TableName: 'QRRegistrations',
      Key: {
        code: code
      }
    }).promise();

    const item = result.Item;
    const baseUrl = process.env.BASE_URL || 'https://example.com';

    // Determine redirect based on code status
    if (item) {
      // Found the code - check if it's assigned
      if (item.finalUrl) {
        // Code is assigned - redirect through the intermediate page
        const redirectPageUrl = `${baseUrl}/redirect-page.html?dest=${encodeURIComponent(item.finalUrl)}`;
        
        return {
          status: 302, // Using 302 for intermediate redirect
          headers: {
            'Location': redirectPageUrl
          },
          body: {
            redirect: true,
            url: redirectPageUrl,
            finalDestination: item.finalUrl
          }
        };
      } else {
        // Code is not assigned - redirect to registration page
        const registrationUrl = `${baseUrl}/register.html?code=${code}`;
        
        return {
          status: 302,
          headers: {
            'Location': registrationUrl
          },
          body: {
            redirect: true,
            url: registrationUrl
          }
        };
      }
    } else {
      // Code not found - return 404
      return {
        status: 404,
        body: {
          error: 'QR code not found'
        }
      };
    }
  } catch (error) {
    console.error('Error processing QR code redirect:', error);
    return {
      status: 500,
      body: {
        error: 'Failed to process QR code',
        message: error.message
      }
    };
  }
}; 