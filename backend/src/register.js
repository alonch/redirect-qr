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
    // Get registration data from request body
    const { code, finalUrl } = req.body;
    
    // Validate inputs
    if (!code) {
      return {
        status: 400,
        body: {
          error: 'Missing required field: code'
        }
      };
    }

    if (!finalUrl) {
      return {
        status: 400,
        body: {
          error: 'Missing required field: finalUrl'
        }
      };
    }

    // Check if the code exists first
    const getResult = await dynamoDB.get({
      TableName: 'QRRegistrations',
      Key: {
        code: code
      }
    }).promise();

    if (!getResult.Item) {
      return {
        status: 404,
        body: {
          error: 'QR code not found'
        }
      };
    }

    // If code exists but is already assigned, return error
    if (getResult.Item.finalUrl) {
      return {
        status: 409, // Conflict
        body: {
          error: 'QR code has already been registered',
          registeredUrl: getResult.Item.finalUrl
        }
      };
    }

    // Update the item - ensure it's only updated if not already assigned
    try {
      await dynamoDB.update({
        TableName: 'QRRegistrations',
        Key: {
          code: code
        },
        UpdateExpression: 'set finalUrl = :url, assigned = :assigned, registeredAt = :time',
        ConditionExpression: 'attribute_not_exists(finalUrl)',
        ExpressionAttributeValues: {
          ':url': finalUrl,
          ':assigned': true,
          ':time': new Date().toISOString()
        }
      }).promise();

      return {
        status: 200,
        body: {
          success: true,
          message: 'QR code successfully registered',
          code: code,
          finalUrl: finalUrl
        }
      };
    } catch (updateError) {
      // If conditional update fails (someone else registered it first)
      if (updateError.code === 'ConditionalCheckFailedException') {
        return {
          status: 409, // Conflict
          body: {
            error: 'QR code was registered by another user'
          }
        };
      }
      throw updateError;
    }
  } catch (error) {
    console.error('Error registering QR code:', error);
    return {
      status: 500,
      body: {
        error: 'Failed to register QR code',
        message: error.message
      }
    };
  }
}; 