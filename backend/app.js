require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const session = require("express-session");
const { Issuer, generators } = require("openid-client");

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  PutCommand,
} = require("@aws-sdk/lib-dynamodb");

const app = express();

const PORT = process.env.PORT || 3000;

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// --------------------------------------------------
// DynamoDB Configuration
// --------------------------------------------------

const USERS_TABLE =
  process.env.DYNAMODB_USERS_TABLE || "SWENG861Users";

const AWS_REGION =
  process.env.AWS_REGION || "us-east-2";

console.log(
  "Configured DynamoDB users table:",
  USERS_TABLE
);

console.log(
  "Configured AWS region:",
  AWS_REGION
);

const dynamoClient = new DynamoDBClient({
  region: AWS_REGION,
});

const dynamoDB =
  DynamoDBDocumentClient.from(dynamoClient);

// --------------------------------------------------
// Save User to DynamoDB
// --------------------------------------------------

async function saveUserToDatabase(userInfo) {
  try {
    const userId =
      userInfo.sub ||
      userInfo.username ||
      userInfo.email;

    if (!userId) {
      throw new Error(
        "Cognito did not return a valid user identifier."
      );
    }

    if (!USERS_TABLE) {
      throw new Error(
        "DynamoDB table name is missing."
      );
    }

    const item = {
      userId: String(userId),

      email:
        userInfo.email || "",

      username:
        userInfo.preferred_username ||
        userInfo.username ||
        userInfo.email ||
        "",

      createdAt:
        new Date().toISOString(),
    };

    console.log(
      "Attempting to save user to DynamoDB..."
    );

    console.log(
      "TABLE NAME SENT:",
      USERS_TABLE
    );

    console.log(
      "AWS REGION SENT:",
      AWS_REGION
    );

    console.log(
      "ITEM SENT:",
      item
    );

    const command = new PutCommand({
      TableName: USERS_TABLE,
      Item: item,
    });

    await dynamoDB.send(command);

    console.log(
      "SUCCESS - User saved to DynamoDB:",
      userInfo.email
    );
  } catch (error) {
    console.error(
      "DynamoDB ERROR NAME:",
      error.name
    );

    console.error(
      "DynamoDB ERROR MESSAGE:",
      error.message
    );

    console.error(
      "DynamoDB ERROR TYPE:",
      error.__type
    );

    throw error;
  }
}

// --------------------------------------------------
// Amazon Cognito / OpenID Connect
// --------------------------------------------------

let client;

async function initializeClient() {
  const issuerUrl =
    `https://cognito-idp.us-east-2.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`;

  const issuer =
    await Issuer.discover(issuerUrl);

  client = new issuer.Client({
    client_id:
      process.env.COGNITO_CLIENT_ID,

    client_secret:
      process.env.COGNITO_CLIENT_SECRET,

    redirect_uris: [
      process.env.COGNITO_CALLBACK_URL,
    ],

    response_types: ["code"],
  });

  console.log(
    "OpenID client initialized"
  );
}

initializeClient().catch((error) => {
  console.error(
    "OpenID initialization error:",
    error
  );
});

// --------------------------------------------------
// Authentication Middleware
// --------------------------------------------------

const checkAuth = (
  req,
  res,
  next
) => {
  if (!req.session.userInfo) {
    req.isAuthenticated = false;
  } else {
    req.isAuthenticated = true;
  }

  next();
};

// --------------------------------------------------
// Week 1 Public Health Endpoint
// --------------------------------------------------

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
  });
});

// --------------------------------------------------
// Login Route
// --------------------------------------------------

app.get("/login", (req, res) => {
  if (!client) {
    return res
      .status(503)
      .send(
        "Authentication service is still initializing."
      );
  }

  const nonce =
    generators.nonce();

  const state =
    generators.state();

  req.session.nonce = nonce;
  req.session.state = state;

  const authUrl =
    client.authorizationUrl({
      scope: "openid email",
      nonce,
      state,
    });

  res.redirect(authUrl);
});

// --------------------------------------------------
// Home / Cognito Callback
// --------------------------------------------------

app.get("/", async (req, res) => {
  // If Cognito did not return an authorization code,
  // show authenticated state or login link.
  if (!req.query.code) {
    if (req.session.userInfo) {
      return res
        .status(200)
        .json({
          message:
            "User is authenticated",

          user: {
            username:
              req.session.userInfo
                .preferred_username ||
              req.session.userInfo
                .username ||
              req.session.userInfo
                .email,

            email:
              req.session.userInfo
                .email,
          },
        });
    }

    return res.send(`
      <h1>SWENG 861 Authentication Demo</h1>
      <p>You are not logged in.</p>
      <p>
        <a href="/login">
          Login with Amazon Cognito
        </a>
      </p>
    `);
  }

  // Cognito returned an authorization code
  try {
    const params =
      client.callbackParams(req);

    const tokenSet =
      await client.callback(
        process.env.COGNITO_CALLBACK_URL,

        params,

        {
          nonce:
            req.session.nonce,

          state:
            req.session.state,
        }
      );

    const userInfo =
      await client.userinfo(
        tokenSet.access_token
      );

    console.log(
      "Authenticated Cognito user:",
      userInfo.email
    );

    // Save authenticated session first
    req.session.userInfo =
      userInfo;

    req.session.accessToken =
      tokenSet.access_token;

    req.session.idToken =
      tokenSet.id_token;

    // Try DynamoDB separately so DB failure
    // does not break successful authentication.
    try {
      await saveUserToDatabase(
        userInfo
      );
    } catch (dbError) {
      console.error(
        "User authenticated successfully, but DynamoDB save failed:",
        dbError.message
      );
    }

    res.redirect("/");
  } catch (error) {
    console.error(
      "Authentication callback error:",
      error
    );

    return res
      .status(500)
      .send(
        "Authentication failed"
      );
  }
});

// --------------------------------------------------
// Logout Route
// --------------------------------------------------

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    const logoutUrl =
      `${process.env.COGNITO_DOMAIN}/logout` +
      `?client_id=${process.env.COGNITO_CLIENT_ID}` +
      `&logout_uri=${encodeURIComponent(
        process.env.COGNITO_LOGOUT_URL
      )}`;

    res.redirect(logoutUrl);
  });
});

// --------------------------------------------------
// Week 2 Protected Endpoint
// --------------------------------------------------

app.get(
  "/api/hello",
  checkAuth,
  (req, res) => {
    if (!req.isAuthenticated) {
      return res
        .status(401)
        .json({
          message: "Unauthorized",
        });
    }

    return res
      .status(200)
      .json({
        message:
          "Hello, authenticated user!",

        user: {
          username:
            req.session.userInfo
              .preferred_username ||
            req.session.userInfo
              .username ||
            req.session.userInfo
              .email,

          email:
            req.session.userInfo
              .email,
        },
      });
  }
);

// --------------------------------------------------
// Start Server
// --------------------------------------------------

app.listen(PORT, () => {
  console.log(
    `Server running at http://localhost:${PORT}`
  );
});
