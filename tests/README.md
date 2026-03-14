# Tests

This folder contains:

- runnable smoke tests for the current Express app
- skipped contract tests for future API endpoints

Run all tests with:

```bash
npm test
```

When a real endpoint is implemented, remove `skip: true` and replace the empty body with request assertions.
