const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
app.use(express.json());

const serverless = require('serverless-http');
const handler = serverless(app);

app.use(
  cors(),
);

// Serve static files from the frontend directory
app.use(express.static(path.join(__dirname, '../../frontend/public')));

app.post('/plus', async (httpReq, httpResp) => {
  const resp = await require('./plus').handler(httpReq);
  httpResp
    .status(resp.status)
    .json(resp.body);
});

app.post('/generate', async (httpReq, httpResp) => {
  const resp = await require('./generate').handler(httpReq);
  httpResp
    .status(resp.status)
    .json(resp.body);
});

app.post('/register', async (httpReq, httpResp) => {
  const resp = await require('./register').handler(httpReq);
  httpResp
    .status(resp.status)
    .json(resp.body);
});

app.get('/qr/:code', async (httpReq, httpResp) => {
  const resp = await require('./redirect').handler(httpReq);
  
  // Set any headers from the response
  if (resp.headers) {
    Object.keys(resp.headers).forEach(header => {
      httpResp.set(header, resp.headers[header]);
    });
  }
  
  // For redirects (status 301 or 302), don't return JSON
  if (resp.status === 301 || resp.status === 302) {
    httpResp.status(resp.status).end();
  } else {
    httpResp.status(resp.status).json(resp.body);
  }
});

const startServer = async () => {
  app.listen(3001, () => {
    console.log("listening on port 3001!");
  });
}

startServer();

module.exports.handler = (event, context, callback) => {
  return handler(event, context, callback);
};