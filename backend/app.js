require("dotenv").config({ path: __dirname + "/.env" });

const axios = require("axios");
const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const EventEmitter = require("events");
const { Issuer, generators } = require("openid-client");

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
  PutCommand,
  ScanCommand,
  GetCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const app = express();
const domainEvents = new EventEmitter();
const PORT = process.env.PORT || 3000;
const USERS_TABLE =
  process.env.DYNAMODB_USERS_TABLE || "SWENG861Users";

const INSIGHTS_TABLE =
  process.env.DYNAMODB_INSIGHTS_TABLE || "SWENG861FinancialInsights";

const TREASURY_TABLE =
  process.env.DYNAMODB_TREASURY_TABLE || "SWENG861TreasuryData";

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
  "Configured financial insights table:",
  INSIGHTS_TABLE
);

console.log(
  "Configured treasury data table:",
  TREASURY_TABLE
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
// Week 3 - Domain Event Handler
// --------------------------------------------------

domainEvents.on(
  "insight.created",
  (eventData) => {
    setImmediate(() => {
      console.log(
        "DOMAIN EVENT - insight.created:",
        eventData
      );
    });
  }
);



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
// Week 3 - Create Financial Insight
// --------------------------------------------------

app.post(
  "/api/insights",
  requireAuth,
  async (req, res) => {
    try {
      const {
        title,
        description,
        category,
        status,
      } = req.body;

      // Basic validation
      if (
        !title ||
        !description ||
        !category
      ) {
        return res.status(400).json({
          error: "BadRequest",
          message:
            "title, description, and category are required",
        });
      }

      const now =
        new Date().toISOString();

      const insight = {
        insightId:
          crypto.randomUUID(),

        ownerId:
          req.user.userId,

        title:
          title.trim(),

        description:
          description.trim(),

        category:
          category.trim(),

        status:
          status
            ? status.trim()
            : "Open",

        createdAt:
          now,

        updatedAt:
          now,
      };

      const command =
        new PutCommand({
          TableName:
            INSIGHTS_TABLE,

          Item:
            insight,

          ConditionExpression:
            "attribute_not_exists(insightId)",
        });

      await dynamoDB.send(
        command
      );

      console.log(
        "Financial insight created:",
        insight
      );


      domainEvents.emit(
        "insight.created",
        {
          insightId:
          insight.insightId,
          ownerId:
          insight.ownerId,
          
          occurredAt:
          new Date().toISOString(),
        }
      );

      return res
        .status(201)
        .json({
          message:
            "Financial insight created successfully",

          data:
            insight,
        });
    } catch (error) {
      console.error(
        "Create insight error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "InternalServerError",

          message:
            "Unable to create financial insight",
        });
    }
  }
);


// --------------------------------------------------
// Week 3 - Get Financial Insights for Current User
// --------------------------------------------------

app.get(
  "/api/insights",
  requireAuth,
  async (req, res) => {
    try {
      const command = new ScanCommand({
        TableName: INSIGHTS_TABLE,

        FilterExpression:
          "ownerId = :ownerId",

        ExpressionAttributeValues: {
          ":ownerId":
            req.user.userId,
        },
      });

      const result =
        await dynamoDB.send(command);

      return res
        .status(200)
        .json({
          message:
            "Financial insights retrieved successfully",

          count:
            result.Items
              ? result.Items.length
              : 0,

          data:
            result.Items || [],
        });
    } catch (error) {
      console.error(
        "Get insights error:",
        error
      );

      return res
        .status(500)
        .json({
          error:
            "InternalServerError",

          message:
            "Unable to retrieve financial insights",
        });
    }
  }
);


// --------------------------------------------------
// Week 3 - Get One Financial Insight by ID
// --------------------------------------------------

app.get(
  "/api/insights/:id",
  requireAuth,
  async (req, res) => {
    try {
      const command = new GetCommand({
        TableName: INSIGHTS_TABLE,
        Key: {
          insightId: req.params.id,
        },
      });

      const result =
        await dynamoDB.send(command);

      if (!result.Item) {
        return res.status(404).json({
          error: "NotFound",
          message:
            "Financial insight not found",
        });
      }

      if (
        result.Item.ownerId !==
        req.user.userId
      ) {
        return res.status(403).json({
          error: "Forbidden",
          message:
            "You are not authorized to access this financial insight",
        });
      }

      return res.status(200).json({
        message:
          "Financial insight retrieved successfully",
        data: result.Item,
      });
    } catch (error) {
      console.error(
        "Get insight by ID error:",
        error
      );

      return res.status(500).json({
        error:
          "InternalServerError",
        message:
          "Unable to retrieve financial insight",
      });
    }
  }
);


// --------------------------------------------------
// Week 3 - Update Financial Insight
// --------------------------------------------------

app.put(
  "/api/insights/:id",
  requireAuth,
  async (req, res) => {
    try {
      const existingCommand = new GetCommand({
        TableName: INSIGHTS_TABLE,
        Key: {
          insightId: req.params.id,
        },
      });

      const existingResult =
        await dynamoDB.send(existingCommand);

      if (!existingResult.Item) {
        return res.status(404).json({
          error: "NotFound",
          message: "Financial insight not found",
        });
      }

      if (
        existingResult.Item.ownerId !==
        req.user.userId
      ) {
        return res.status(403).json({
          error: "Forbidden",
          message:
            "You are not authorized to update this financial insight",
        });
      }

      const {
        title,
        description,
        category,
        status,
      } = req.body;

      if (
        !title ||
        !description ||
        !category ||
        !status
      ) {
        return res.status(400).json({
          error: "BadRequest",
          message:
            "title, description, category, and status are required",
        });
      }

      const now =
        new Date().toISOString();

      const command = new UpdateCommand({
        TableName: INSIGHTS_TABLE,

        Key: {
          insightId: req.params.id,
        },

        UpdateExpression:
          "SET title = :title, description = :description, category = :category, #status = :status, updatedAt = :updatedAt",

        ExpressionAttributeNames: {
          "#status": "status",
        },

        ExpressionAttributeValues: {
          ":title": title.trim(),
          ":description": description.trim(),
          ":category": category.trim(),
          ":status": status.trim(),
          ":updatedAt": now,
        },

        ReturnValues: "ALL_NEW",
      });

      const result =
        await dynamoDB.send(command);

      return res.status(200).json({
        message:
          "Financial insight updated successfully",
        data:
          result.Attributes,
      });
    } catch (error) {
      console.error(
        "Update insight error:",
        error
      );

      return res.status(500).json({
        error: "InternalServerError",
        message:
          "Unable to update financial insight",
      });
    }
  }
);


// --------------------------------------------------
// Week 3 - Delete Financial Insight
// --------------------------------------------------

app.delete(
  "/api/insights/:id",
  requireAuth,
  async (req, res) => {
    try {
      const existingCommand = new GetCommand({
        TableName: INSIGHTS_TABLE,
        Key: {
          insightId: req.params.id,
        },
      });

      const existingResult =
        await dynamoDB.send(existingCommand);

      if (!existingResult.Item) {
        return res.status(404).json({
          error: "NotFound",
          message: "Financial insight not found",
        });
      }

      if (
        existingResult.Item.ownerId !==
        req.user.userId
      ) {
        return res.status(403).json({
          error: "Forbidden",
          message:
            "You are not authorized to delete this financial insight",
        });
      }

      const deleteCommand =
        new DeleteCommand({
          TableName: INSIGHTS_TABLE,
          Key: {
            insightId: req.params.id,
          },
        });

      await dynamoDB.send(
        deleteCommand
      );

      return res.status(200).json({
        message:
          "Financial insight deleted successfully",
      });
    } catch (error) {
      console.error(
        "Delete insight error:",
        error
      );

      return res.status(500).json({
        error: "InternalServerError",
        message:
          "Unable to delete financial insight",
      });
    }
  }
);

// --------------------------------------------------
// Week 3 - Fetch, Validate, and Save Treasury Debt Data
// --------------------------------------------------

app.get(
  "/api/external/treasury-debt",
  requireAuth,
  async (req, res) => {
    try {
      // Call the U.S. Treasury Fiscal Data API
      const response = await axios.get(
        "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny"
      );

      // Validate that the expected data array exists
      const records =
        response.data &&
        Array.isArray(response.data.data)
          ? response.data.data
          : null;

      if (!records || records.length === 0) {
        return res.status(502).json({
          error: "BadGateway",
          message:
            "Treasury API did not return valid debt data",
        });
      }

      // Use the first record returned by the API
      const latestRecord = records[0];

      // Validate required fields
      if (
        !latestRecord.record_date ||
        !latestRecord.tot_pub_debt_out_amt
      ) {
        return res.status(502).json({
          error: "BadGateway",
          message:
            "Treasury API response is missing required fields",
        });
      }

      // Normalize the third-party API data
      const validatedData = {
        source:
          "U.S. Treasury Fiscal Data",

        recordDate:
          latestRecord.record_date,

        totalPublicDebt:
          latestRecord.tot_pub_debt_out_amt,

        debtHeldPublic:
          latestRecord.debt_held_public_amt ||
          null,

        intragovHoldings:
          latestRecord.intragov_hold_amt ||
          null,
      };

      // Create the DynamoDB record
      const externalDataRecord = {
        externalDataId:
          crypto.randomUUID(),

        // Tie imported data to authenticated user
        ownerId:
          req.user.userId,

        source:
          validatedData.source,

        recordDate:
          validatedData.recordDate,

        totalPublicDebt:
          validatedData.totalPublicDebt,

        debtHeldPublic:
          validatedData.debtHeldPublic,

        intragovHoldings:
          validatedData.intragovHoldings,

        importedAt:
          new Date().toISOString(),
      };

      // Save validated Treasury data to DynamoDB
      const saveCommand =
        new PutCommand({
          TableName:
            TREASURY_TABLE,

          Item:
            externalDataRecord,

          ConditionExpression:
            "attribute_not_exists(externalDataId)",
        });

      await dynamoDB.send(
        saveCommand
      );

      console.log(
        "Treasury data saved:",
        externalDataRecord
      );

      // Return success response
      return res.status(200).json({
        message:
          "Treasury data retrieved, validated, and saved successfully",

        data:
          externalDataRecord,
      });
    } catch (error) {
      console.error(
        "Treasury API / persistence error:",
        error
      );

      return res.status(500).json({
        error:
          "InternalServerError",

        message:
          "Unable to retrieve or save Treasury data",
      });
    }
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
