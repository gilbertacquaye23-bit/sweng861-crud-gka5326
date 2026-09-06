require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const session = require("express-session");
const { Issuer, generators } = require("openid-client");

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const app = express();

const PORT = process.env.PORT || 3000;
const USERS_TABLE =
  process.env.DYNAMODB_USERS_TABLE || "SWENG861Users";
const AWS_REGION =
  process.env.AWS_REGION || "us-east-2";

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // localhost only
    },
  })
);

// --------------------------------------------------
// DynamoDB Configuration
// --------------------------------------------------

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
// Create or Update Local User
// --------------------------------------------------

async function saveOrUpdateUser(userInfo) {
  const providerId = userInfo.sub;

  if (!providerId) {
    throw new Error(
      "Cognito did not return a stable provider identifier."
    );
  }

  const userId = providerId;
  const now = new Date().toISOString();

  const email =
    userInfo.email || "";

  const username =
    userInfo.preferred_username ||
    userInfo.username ||
    email ||
    "";

  const command = new UpdateCommand({
    TableName: USERS_TABLE,

    Key: {
      userId,
    },

    UpdateExpression: `
      SET
        providerId = :providerId,
        email = :email,
        username = :username,
        createdAt = if_not_exists(createdAt, :createdAt),
        updatedAt = :updatedAt,
        lastLoginAt = :lastLoginAt
    `,

    ExpressionAttributeValues: {
      ":providerId": providerId,
      ":email": email,
      ":username": username,
      ":createdAt": now,
      ":updatedAt": now,
      ":lastLoginAt": now,
    },

    ReturnValues: "ALL_NEW",
  });

  const result =
    await dynamoDB.send(command);

  console.log(
    "SUCCESS - Local user record saved/updated:",
    result.Attributes
  );

  return result.Attributes;
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
    error.message
  );
});

// --------------------------------------------------
// Reusable Authentication Middleware
// --------------------------------------------------

async function requireAuth(req, res, next) {
  try {
    let userInfo = null;

    const authHeader =
      req.headers.authorization;

    // Bearer token path for Postman/API clients
    if (
      authHeader &&
      authHeader.startsWith("Bearer ")
    ) {
      if (!client) {
        return res.status(503).json({
          error: "ServiceUnavailable",
          message:
            "Authentication service is initializing",
        });
      }

      const accessToken =
        authHeader.substring(7);

      userInfo =
        await client.userinfo(
          accessToken
        );
    }

    // Browser session path
    else if (
      req.session &&
      req.session.userInfo
    ) {
      userInfo =
        req.session.userInfo;
    }

    if (!userInfo) {
      return res.status(401).json({
        error: "Unauthorized",
        message:
          "Valid authentication is required",
      });
    }

    req.user = {
      userId:
        userInfo.sub,

      email:
        userInfo.email || null,

      username:
        userInfo.preferred_username ||
        userInfo.username ||
        userInfo.email ||
        null,
    };

    next();
  } catch (error) {
    console.error(
      "Authentication middleware error:",
      error.message
    );

    return res.status(401).json({
      error: "Unauthorized",
      message:
        "Valid access token is required",
    });
  }
}

// --------------------------------------------------
// Week 1 Health Endpoint
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

  req.session.nonce =
    nonce;

  req.session.state =
    state;

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
  // Normal home request
  if (!req.query.code) {

    if (req.session.userInfo) {
      return res
        .status(200)
        .json({
          message:
            "User is authenticated",

          user: {
            email:
              req.session.userInfo.email,
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

  // Cognito callback
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

    req.session.userInfo =
      userInfo;

    req.session.accessToken =
      tokenSet.access_token;

    req.session.idToken =
      tokenSet.id_token;

    try {
      await saveOrUpdateUser(
        userInfo
      );
    } catch (dbError) {
      console.error(
        "Authentication succeeded, but user persistence failed:",
        dbError.message
      );
    }

    res.redirect("/");
  } catch (error) {
    console.error(
      "Authentication callback error:",
      error.message
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
  requireAuth,
  (req, res) => {

    const email =
      req.user.email ||
      "authenticated user";

    return res
      .status(200)
      .json({
        message:
          `Hello, ${email}!`,
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
