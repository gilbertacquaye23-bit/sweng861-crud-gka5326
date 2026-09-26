# sweng861-crud-gka5326

SWENG 861 CRUD application

Full Name: Gilbert Acquaye

Course Name: SWENG 861 -Software Construction

Project Description: This is a segment of CRUD application under development for SWENG 861 -Software Construction.

The application will functionalities for creating, reading, updating and deleting project records.

## Week 2 - Authentication and Protected API

## Authentication Strategy

This project uses Amazon Cognito as an external Identity Provider with OAuth 2.0 / OpenID Connect authorization code flow. Cognito was selected because it provides managed authentication and standards-based token support without requiring the application to store user passwords. The user initiates login from the application, is redirected to Cognito, and returns with an authorization code. The backend exchanges the code for tokens, retrieves the authenticated identity, persists the local user record in DynamoDB, and establishes the authenticated application context.

### Authentication Flow

- Client selects Login
- Application redirects to Amazon Cognito
- Cognito authenticates the user
- Cognito redirects back with an authorization code
- Backend exchanges the code for tokens
- Backend retrieves the Cognito user profile
- User identity is created or updated in DynamoDB
- Authentication middleware validates session or Bearer token
- Protected API becomes accessible

## Protected Endpoint

`GET /api/hello` is protected by the reusable `requireAuth` middleware. The middleware accepts either the authenticated application session or a valid Cognito Bearer access token. It retrieves the authenticated identity and attaches `userId`, `email`, and `username` to `req.user`. Requests without valid authentication receive HTTP 401 Unauthorized. Valid authenticated requests receive HTTP 200 OK.

## OWASP API Security Practices

- **Broken Object Level Authorization (BOLA):** User identity is derived from the authenticated Cognito identity and `req.user`, rather than trusting a client-supplied user identifier.
- **Excessive Data Exposure:** The protected endpoint returns only the information required for the response instead of returning full user or token objects.
- **Security Misconfiguration:** Secrets are stored in `.env`, `.env` is excluded from Git, detailed errors are logged server-side, and internal stack traces are not returned to API clients.

### User Persistence

Authenticated user identities are persisted in Amazon DynamoDB.

DynamoDB table:

SWENG861Users

Stored attributes include:

- userId
- email
- username
- createdAt

Passwords are not stored in DynamoDB. Password authentication is
handled by Amazon Cognito.

### API Endpoints

#### Public Health Endpoint

GET /health

Example response:

```json
{
  "status": "ok"
}


## Automated Testing

The project includes automated backend and frontend test suites covering unit, integration, UI, authentication, authorization, validation, loading, and error scenarios.

### Backend Tests

From the project root, run:

```bash
npm test
Generate the backend coverage report with:
npm run test:coverage
The backend test suite uses Jest and Supertest. DynamoDB operations are mocked during automated tests, so the tests do not modify production data.
The HTML coverage report is generated in:
coverage/index.html
Frontend Tests
From the project root, run:
cd frontend
npm test
Generate the frontend coverage report with:
npm run test:coverage
The frontend test suite uses Vitest, React Testing Library, and jsdom.
The HTML coverage report is generated in:
frontend/coverage/index.html
Production Build Verification
From the frontend directory, run:
npm run build
Test Summary
Backend: 22 automated tests
Frontend: 17 automated tests
Backend core service line coverage: 100%
Frontend overall line coverage: 80.79%
Security scenarios include unauthenticated 401, authenticated owner 200, cross-user 403, missing record 404, and protected-route redirection.
