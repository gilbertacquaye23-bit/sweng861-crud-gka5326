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

## Week 6: DevOps and Observability

### Continuous Integration
- GitHub Actions runs on pushes and pull requests to main.
- The pipeline installs backend and frontend dependencies, runs tests,
  audits production backend dependencies, builds the frontend, and builds
  the backend Docker image.
- The CI image uses the commit SHA as its tag.
- Backend tests use a disposable CI-only SESSION_SECRET.
- Failed tests or high/critical audit findings stop the pipeline.

### Local Tests
Run from the repository root:

```powershell
npm ci
npm test
npm audit --omit=dev --audit-level=high
npm --prefix frontend ci
npm --prefix frontend test
npm --prefix frontend run build
```

### Local Backend Container
Start Docker Desktop and configure backend/.env with the required
session, Cognito, and AWS settings. Do not commit credentials.

Run from the repository root:

```powershell
docker build -t sweng861-backend:week6 .
docker run --rm --name sweng861-week6 -p 3000:3000 --env-file .\backend\.env sweng861-backend:week6
```

If sweng861-week6 is already running, stop it before launching the replacement:

```powershell
docker stop sweng861-week6
```

In another terminal, verify health and metrics:

```powershell
Invoke-RestMethod http://localhost:3000/health
(Invoke-WebRequest http://localhost:3000/metrics).Content
docker logs sweng861-week6
```

### Logging and Monitoring
- Request logs contain timestamp, severity, request ID, method, route,
  status code, and duration.
- Application event logs use JSON without emails, complete records,
  credentials, or raw error objects.
- Route event logs include a request ID for correlation.
- /health confirms that the HTTP application responds; it does not
  verify DynamoDB or Cognito readiness.
- /metrics exposes http_requests_total and
  http_request_duration_seconds.
- Prometheus configuration: monitoring/prometheus.yml.
- Grafana dashboard export: monitoring/dashboard.json.
- Local Prometheus: http://localhost:9090.
- Local Grafana: http://localhost:3001.
- Dashboard panels show request rate, 4xx/5xx error rates, and p95 latency.
- Use request rate to identify traffic changes, error rates to identify
  failures, and latency to investigate slow responses.
- Expected unauthenticated 401 responses count as client errors.

### Proposed Service Objectives
- Availability: at least 99.5% of completed /health requests return
  HTTP 200 over a rolling seven days.
- Performance: p95 latency of successful GET /api/insights requests
  is 500 milliseconds or less over a rolling seven days.
- These are proposed targets, not verified seven-day results.
- Independent availability checks are needed to detect requests that
  cannot reach the application.

### Security and Production Considerations
- Environment files are excluded from Git and Docker builds.
- The Docker image runs as a non-root user.
- CI audits production backend dependencies.
- Production should use managed secrets, least-privilege access,
  HTTPS, and shared session storage.
- The current in-memory session store is unsuitable for multiple
  backend instances.