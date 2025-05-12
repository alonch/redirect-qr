#!/bin/bash

# First make sure AWS SSO login is active
echo "Ensuring AWS SSO login is active..."
aws sso login --profile realsense-development

# Set required environment variables
export AWS_SDK_LOAD_CONFIG=1
export AWS_PROFILE=realsense-development
export AWS_REGION=us-east-1
export BASE_URL=http://localhost:3001

# Start the server
echo "Starting server with AWS configuration..."
npm start 