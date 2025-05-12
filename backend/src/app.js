const express = require('express');
const cors = require('cors');
const app = express();
app.use(express.json());

const serverless = require('serverless-http');
const handler = serverless(app);

app.use(
  cors(),
);

app.post('/plus', async (httpReq, httpResp) => {
  const resp = await require('./plus').handler(httpReq);
  httpResp
    .status(resp.status)
    .json(resp.body);
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