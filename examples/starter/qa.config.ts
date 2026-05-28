import { defineConfig } from '@qa/core';

export default defineConfig({
  team: {
    id: 'web-checkout', // must match a team you own; upserted into qa.teams on every run
    name: 'Checkout',
    slackChannel: '#qa-checkout',
    oncall: 'jane@example.com',
  },
  toggles: {
    dbLogging: true, // auto-disabled when DATABASE_URL is unset
    htmlReport: true,
  },
  // reportDir, spoolDir, caseArchiveThresholdDays have sensible defaults — override if needed.
});
