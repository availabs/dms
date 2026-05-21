#!/usr/bin/env node
/**
 * Quick SMTP smoke test. Sends a branded test email using the same
 * sendEmail + buildEmailHtml functions the auth handlers use.
 *
 * Usage:
 *   node test-email.js recipient@example.com
 *   node test-email.js recipient@example.com "https://your-public-site.com"
 *
 * Reads SMTP_* vars from ../../.env (the project root .env).
 */

// Load .env from project root manually (no dotenv dep needed)
const fs = require('fs');
const envPath = require('path').resolve(__dirname, '../../../../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const { sendEmail, buildEmailHtml } = require('./src/auth/utils/email');

const to = process.argv[2];
const siteOrigin = process.argv[3] || '';

if (!to) {
  console.error('Usage: node test-email.js recipient@example.com [https://site-origin]');
  process.exit(1);
}

const html = buildEmailHtml({
  title: 'Email Test',
  body: 'This is a test email from DMS. If you see this, SMTP is working.',
  ctaText: 'Visit Site',
  ctaUrl: siteOrigin || undefined,
  footer: 'Sent via test-email.js',
  theme: {
    logoUrl: siteOrigin ? `${siteOrigin}/themes/wcdb/logo_white.svg` : '',
    logoTitle: 'DMS',
    siteOrigin,
  },
});

sendEmail(to, 'DMS Email Test', 'SMTP test from DMS.', html)
  .then(ok => {
    if (ok) console.log(`Sent to ${to}`);
    else console.error('Not sent — check SMTP_* env vars');
    process.exit(ok ? 0 : 1);
  });
