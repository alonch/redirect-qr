const AWS = require('aws-sdk');

// Set to load from shared config/credentials
process.env.AWS_SDK_LOAD_CONFIG = 1;

// Use the profile specified in AWS_PROFILE environment variable
const profile = process.env.AWS_PROFILE || 'realsense-development';
console.log(`Using AWS profile: ${profile}`);

// Set region explicitly
AWS.config.update({ 
  region: 'us-east-1', // Change to your actual region
  credentials: new AWS.SharedIniFileCredentials({ profile: profile })
});

async function testAwsConnection() {
  console.log('Testing AWS connection...');
  
  try {
    // Print current configuration
    console.log('AWS SDK Version:', AWS.VERSION);
    console.log('Region:', AWS.config.region);
    
    // Test DynamoDB connection
    const dynamoDB = new AWS.DynamoDB();
    const tables = await dynamoDB.listTables().promise();
    console.log('DynamoDB connection successful!');
    console.log('Available tables:', tables.TableNames);
    
    // Try to describe our table if it exists
    try {
      const tableInfo = await dynamoDB.describeTable({ TableName: 'QRRegistrations' }).promise();
      console.log('QRRegistrations table exists:', tableInfo.Table);
    } catch (tableError) {
      console.log('Could not find QRRegistrations table:', tableError.message);
    }
    
    console.log('AWS configuration appears to be working correctly.');
  } catch (error) {
    console.error('Error connecting to AWS:', error);
  }
}

testAwsConnection(); 