/**
 * Optional email sending utility.
 * If nodemailer is installed and SMTP_HOST is set, emails will be sent.
 * SMTP_USER/SMTP_PASS are optional — omit them for unauthenticated local relays.
 *
 * Environment variables:
 *   SMTP_HOST     - SMTP server hostname (required)
 *   SMTP_PORT     - SMTP port (default 587)
 *   SMTP_USER     - SMTP username (optional — omit for local relay)
 *   SMTP_PASS     - SMTP password (optional — omit for local relay)
 *   SMTP_FROM     - From address (required)
 *   SMTP_SECURE   - Use TLS (default: false, uses STARTTLS)
 */

let transporter = null;

function getTransporter() {
  if (transporter !== null) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;

  if (!SMTP_HOST) {
    transporter = false;
    return transporter;
  }

  try {
    const nodemailer = require('nodemailer');
    const config = {
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT || '587', 10),
      secure: SMTP_SECURE === 'true',
      tls: { rejectUnauthorized: false },
    };
    if (SMTP_USER && SMTP_PASS) {
      config.auth = { user: SMTP_USER, pass: SMTP_PASS };
    }
    transporter = nodemailer.createTransport(config);
    transporter._fromAddress = SMTP_FROM || SMTP_USER || 'noreply@localhost';
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

const DEFAULT_THEME = {
  primaryColor:    '#1e3a8a',
  accentColor:     '#dbeafe',
  textColor:       '#374151',
  backgroundColor: '#f4f4f5',
  logoUrl:         '',
  logoTitle:       '',
  siteOrigin:      '',
};

/**
 * Build branded HTML email that mirrors the active site theme.
 *
 * @param {object} opts
 * @param {string}  opts.title         - Heading shown in the card body (uppercase)
 * @param {string}  opts.body          - Body HTML content
 * @param {string}  [opts.ctaText]     - CTA button label
 * @param {string}  [opts.ctaUrl]      - CTA button URL
 * @param {string}  [opts.footer]      - Small footer note
 * @param {object}  [opts.theme]       - emailTheme object from the client
 * @returns {string} HTML string
 */
function buildEmailHtml({ title, body, ctaText, ctaUrl, footer, theme = {} }) {
  const t = { ...DEFAULT_THEME, ...theme };

  // Resolve relative logo URLs to absolute so email clients can load them
  let logoSrc = t.logoUrl || '';
  if (logoSrc && logoSrc.startsWith('/') && t.siteOrigin) {
    logoSrc = `${t.siteOrigin}${logoSrc}`;
  }

  const logoBlock = logoSrc
    ? `<img src="${logoSrc}" alt="${t.logoTitle}" style="max-height:44px;max-width:180px;display:block;border:0;">`
    : `<span style="font-weight:700;font-size:18px;color:${t.primaryColor};">${t.logoTitle}</span>`;

  const ctaBlock = ctaText && ctaUrl
    ? `<div style="margin-top:20px;">
        <a href="${ctaUrl}"
           style="display:inline-block;padding:10px 24px;background-color:${t.accentColor};color:${t.primaryColor};font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;border-radius:9999px;text-decoration:none;">
          ${ctaText}
        </a>
      </div>`
    : '';

  const titleBlock = title
    ? `<div style="font-weight:700;font-size:18px;color:${t.primaryColor};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:12px;">${title}</div>`
    : '';

  const footerBlock = footer
    ? `<tr>
        <td style="padding:12px 32px;color:#9ca3af;font-size:12px;line-height:1.5;border-top:1px solid #f3f4f6;">
          ${footer}
        </td>
      </tr>`
    : '';
  console.log('build html')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:${t.backgroundColor};">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:${t.backgroundColor};padding:40px 16px;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" border="0"
               style="max-width:540px;width:100%;background-color:#ffffff;border:1px solid ${t.accentColor};border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:${t.accentColor};padding:20px 32px;">
              ${logoBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;background-color:#ffffff;">
              ${titleBlock}
              <div style="font-size:14px;color:${t.textColor};line-height:1.6;">${body}</div>
              ${ctaBlock}
            </td>
          </tr>
          ${footerBlock}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Legacy template — kept for backward compatibility with existing callers.
 */
function htmlTemplate(body1, body2, href, clickText) {
  return buildEmailHtml({
    title: body1,
    body: body2,
    ctaText: clickText,
    ctaUrl: href,
  });
}

function htmlTemplateNoClick(heading, body) {
  return buildEmailHtml({ title: heading, body });
}

function htmlTemplateSimple(text) {
  return buildEmailHtml({ body: text });
}

module.exports = {
  sendEmail,
  buildEmailHtml,
  htmlTemplate,
  htmlTemplateNoClick,
  htmlTemplateSimple,
};
