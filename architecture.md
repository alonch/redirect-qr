# **Current Project Structure & Technology Stack**

This project is structured as a monorepo containing both backend and frontend components:

## **Folder Structure**

```
vanjs-demo/
├── .github/            # GitHub Actions workflows for CI/CD
│   └── workflows/      # Deployment configurations
├── backend/            # Express.js serverless API
│   ├── src/            # Backend source code
│   │   ├── app.js      # Main Express application with serverless wrapper
│   │   └── plus.js     # Sample API endpoint
│   └── package.json    # Backend dependencies
└── frontend/           # React.js application
    ├── public/         # Static assets
    ├── src/            # Frontend source code
    │   ├── App.js      # Main React component
    │   └── ...         # Other React components and utilities
    └── package.json    # Frontend dependencies
```

## **Technology Stack**

1. **Frontend**:
   * React.js (v19) with standard Create React App structure
   * Fetches data from the backend API using environment variable `REACT_APP_API_URL`
   * Built and deployed as static assets to S3/CloudFront

2. **Backend**:
   * Express.js with serverless-http wrapper for AWS Lambda
   * RESTful API endpoints for QR code management:
     * **POST `/generate`** - Creates and returns new QR codes
     * **POST `/register`** - Processes registration data and updates QR assignment
     * **GET `/qr/{code}`** - Handles QR code scans and redirects
   * Deployed as AWS Lambda function

3. **Infrastructure/Deployment**:
   * AWS Lambda for backend API (serverless)
   * S3 + CloudFront + Route53 for static website hosting
   * GitHub Actions workflows for CI/CD:
     * PR-based ephemeral environments
     * Main branch deploys to sandbox environment
     * Tag-based releases (`v*.*.*`) deploy to production environments
   * Infrastructure provisioned via Terraform through custom GitHub Actions

4. **Development Workflow**:
   * Local development with Node.js
   * Pull request workflow with isolated infrastructure
   * Serverless architecture eliminates need for maintaining servers
   * Multi-tenant deployment strategy with separate environments per customer

This architecture follows a modern serverless approach that is cost-effective for low-traffic applications while providing scalability when needed. 