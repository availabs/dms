# DMS Client Tests

## Overview

This folder contains tests for the DMS client package (React components, patterns, data loading).

## Testing Approach

### What to Test

**Pattern behavior** — Do admin patterns correctly CRUD data? Do page patterns render correctly?

**Data loading** — Does `dmsDataLoader` fetch and cache correctly? Does `dmsDataEditor` submit changes properly?

**Component integration** — Do pattern components work with the Falcor data layer?

### What NOT to Test

- Individual UI components in isolation (test them through pattern workflows instead)
- Mocked Falcor responses (use real server integration when possible)
- Framework behavior (React Router, Falcor internals)

## Test Types

### Integration Tests (Recommended)

Test patterns against a real dms-server with SQLite:

```js
// Start dms-server with SQLite
// Use fetch or Falcor client to make real requests
// Verify the data flow works end-to-end
```

### Component Tests (When Needed)

For complex UI logic that's hard to test through integration:

```js
import { render, screen } from '@testing-library/react';
import { PatternComponent } from '../src/patterns/page/components/PatternComponent';

test('renders pattern correctly', () => {
  render(<PatternComponent data={testData} />);
  expect(screen.getByText('Expected Title')).toBeInTheDocument();
});
```

### E2E Tests (For Critical Paths)

Use Playwright for full browser testing of critical user journeys:

```js
test('create and publish a page', async ({ page }) => {
  await page.goto('/admin');
  await page.click('[data-testid="create-page"]');
  // ... complete the workflow
  await expect(page.locator('.page-title')).toHaveText('New Page');
});
```

## Coordination with dms-server Tests

The `dms-server` package has its own tests that verify:
- SQLite/PostgreSQL compatibility
- Controller functions
- Workflow integration (simulating what this client does)

Client tests should focus on:
- React component behavior
- Client-side state management
- UI interactions

Server tests handle:
- Database operations
- API correctness
- Data model integrity

## Running Tests

```bash
# When test scripts are added to package.json:
npm test                  # Run all tests
npm run test:integration  # Integration tests with real server
npm run test:e2e          # Playwright E2E tests
```

## Test Data

Use descriptive app names to identify test data: `'test-client-workflow'`, `'e2e-page-test'`

Clean up test data after tests run, or use unique identifiers that can be filtered out.
