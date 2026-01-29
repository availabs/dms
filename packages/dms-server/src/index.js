const express = require('express');
const compression = require('compression')
const falcorExpress = require('./utils/falcor-express');
const falcorRoutes = require('./routes');
const { createRequestLogger } = require('./middleware/request-logger');

const app = express();
app.use(compression())

const PORT = process.env.PORT || 3001;

app.use(express.raw({ limit: "500mb", type: "application/octet-stream" }));
app.use(express.text({ limit: "500mb", type: "text/*" }));
app.use(express.json({ limit: "500mb" })); // to support JSON-encoded bodies
app.use(express.urlencoded({
  limit: "100mb", extended: true,
  types: ["application/x-www-form-urlencoded", "multipart/form-data"]
})); // to support URL-encoded bodies
app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', req.get('origin'));
  res.header('Cache-Control', 'no-store,no-cache,must-revalidate');
  res.header('Access-Control-Allow-Credentials', true);
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );

  res.header(
    'Access-Control-Allow-Methods',
    'GET,PUT,POST,DELETE,PATCH,OPTIONS'
  );

  if (req.method === 'OPTIONS') {
    return res.end()
  }

  return next();
});

app.get('/', (req, res) => {
  res.send('Hello World');
});

// Request logging middleware (enable with DMS_LOG_REQUESTS=1)
app.use(createRequestLogger());

app.use(
  '/graph',
  falcorExpress.dataSourceRoute(function (req, res) {
    try {
      //const { user = null } = req.availAuthContext || {};
      const user = null;
      return falcorRoutes({ user });
    } catch (e) {
      console.log('graph error')
    }
  })
);

app.use((req, res, next) => {
  res.status(404).send("Invalid Request.");
});

app.listen(PORT, () => {
  console.log(`DMS Server running on port ${PORT}`);
});
