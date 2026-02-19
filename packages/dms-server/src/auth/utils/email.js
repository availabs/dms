/**
 * Optional email sending utility.
 * If nodemailer is installed and SMTP is configured via environment variables,
 * emails will be sent. Otherwise, all functions are no-ops.
 *
 * Environment variables:
 *   SMTP_HOST     - SMTP server hostname
 *   SMTP_PORT     - SMTP port (default 587)
 *   SMTP_USER     - SMTP username
 *   SMTP_PASS     - SMTP password
 *   SMTP_FROM     - From address (default: SMTP_USER)
 *   SMTP_SECURE   - Use TLS (default: false, uses STARTTLS)
 */

let transporter = null;

function getTransporter() {
  if (transporter !== null) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporter = false; // Explicitly disabled
    return transporter;
  }

  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: SMTP_SECURE === 'true',
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    transporter._fromAddress = SMTP_FROM || SMTP_USER;
    console.log(`Email: configured (${SMTP_HOST}:${SMTP_PORT || 587})`);
  } catch (e) {
    console.warn('Email: nodemailer not available, email sending disabled');
    transporter = false;
  }

  return transporter;
}

/**
 * Send an email. No-op if SMTP is not configured or nodemailer is not installed.
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 * @param {string} [html] - HTML body (optional)
 * @returns {Promise<boolean>} true if sent, false if skipped
 */
async function sendEmail(to, subject, text, html) {
  const t = getTransporter();
  if (!t) return false;

  try {
    await t.sendMail({
      from: t._fromAddress,
      to,
      subject,
      text,
      html: html || text,
    });
    return true;
  } catch (e) {
    console.error('Email send failed:', e.message);
    return false;
  }
}

/**
 * Generate HTML email template matching the reference implementation.
 * @param {string} body1 - Main heading text
 * @param {string} body2 - Body content (can include HTML)
 * @param {string} [href] - Link URL
 * @param {string} [clickText] - Link button text
 * @returns {string} HTML string
 */
function htmlTemplate(body1, body2, href, clickText) {
  const button = href && clickText
    ? `<div style="margin-top: 1.5rem;">
        <a href="${href}" style="display: inline-block; padding: 0.75rem 1.5rem; background-color: #4B72FA; color: #fff; text-decoration: none; border-radius: 0.25rem; font-weight: bold;">${clickText}</a>
      </div>`
    : '';

  return `<div style="background-color: #fff; padding: 2rem;">
  <div style="display: inline-block;">
    <div style="padding: 3rem;">
      <div style="border: 2px solid #4B72FA; padding: 1.5rem; border-radius: 0.25rem;">
        <div style="font-size: 1.125rem; font-weight: bold; margin-bottom: 0.75rem;">${body1}</div>
        <div style="font-size: 1rem; line-height: 1.5rem;">${body2}</div>
        ${button}
      </div>
    </div>
  </div>
</div>`;
}

/**
 * Simple HTML template without a click button.
 */
function htmlTemplateNoClick(heading, body) {
  return htmlTemplate(heading, body);
}

/**
 * Simple HTML template with just text.
 */
function htmlTemplateSimple(text) {
  return htmlTemplate('', text);
}

module.exports = {
  sendEmail,
  htmlTemplate,
  htmlTemplateNoClick,
  htmlTemplateSimple,
};
