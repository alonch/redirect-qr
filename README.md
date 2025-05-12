# QR Code Registration System

A serverless web application for conference badge QR codes with dynamic registration and redirection.

## Overview

This application allows conference organizers to:
1. Generate and print unique QR codes for attendee badges
2. When first scanned, direct attendees to a registration form
3. After registration, automatically redirect future scans to the registered URL

## Architecture

This serverless application is built on AWS with the following components:

- **Backend**: Express.js app with serverless-http wrapper for AWS Lambda
- **Database**: DynamoDB for storing QR code registrations
- **Static UI**: HTML/JS/CSS files served by the Express backend
- **Printing**: Web Bluetooth API integration with thermal printers

## Features

- One-time QR code registration flow
- Bluetooth thermal printer integration (no drivers needed)
- Automatic redirection after registration
- Completely serverless architecture (Lambda, S3, DynamoDB)
- Low operational cost for conferences and events

## Development

### Backend & UI

The application is a Node.js Express app with serverless wrapper for AWS Lambda.

First, configure AWS CLI credentials:

```bash
cd backend
npm install
npm start:aws
```

The UI is provided as static files served by the Express backend:
- Admin interface: Generate and print QR codes
- Registration page: For attendees to register their QR codes

## What's Under the Hood

- AWS Lambda for the API (provisioned with Terraform)
- DynamoDB for QR code storage and redirection mapping
- Web Bluetooth API for thermal printer integration

This solution is 100% serverless and extremely cost-effective for low-traffic events.