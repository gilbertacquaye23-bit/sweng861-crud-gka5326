# sweng861-crud-gka5326

SWENG 861 CRUD application

Full Name: Gilbert Acquaye

Course Name: SWENG 861 -Software Construction

Project Description: This is a segment of CRUD application under development for SWENG 861 -Software Construction.

The application will functionalities for creating, reading, updating and deleting project records.

## Week 2 - Authentication and Protected API

### Authentication Strategy

This project uses Amazon Cognito as the identity provider with
OAuth 2.0 / OpenID Connect authorization code flow.

Amazon Cognito authenticates users and issues tokens after
successful login. The Node.js/Express backend maintains the
authenticated user session.

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
