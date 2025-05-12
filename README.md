# Demo for VanJS meetup

This repo is a monorepo for backend and frontend

## Backend

Express app with a serverless wrapper to run on AWS Lambda

## Frontend 

Simple React app that requires `REACT_APP_API_URL` environment variable to call the backend API

# Features

- Sandbox environment from main
- Ephemeral environments on PRs, it will provision isolated infra for each PR branch
- On tags `v*.*.*` will deploy to all customers, for exmaple https://safeway.realsense.ca

# What's under the hood

- AWS Lambda for the API, infra is provision with terraform using `alonch/actions-aws-function-node@main` action

- S3 + CloudFront + Route53 to provision a static website, infra is provision with terraform using `alonch/actions-aws-website@main`

Good to know that this solutions is 100% serverless and it's basically free for low traffic projects. 




chrome://bluetooth-internals/#devices/1d:f7:a1:d6:11:0f