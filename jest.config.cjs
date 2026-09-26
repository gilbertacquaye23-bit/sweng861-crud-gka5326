module.exports = {
  testEnvironment: "node",

  testMatch: [
    "<rootDir>/backend/tests/**/*.test.js",
  ],

  collectCoverageFrom: [
    "backend/**/*.js",
    "!backend/tests/**",
  ],
};