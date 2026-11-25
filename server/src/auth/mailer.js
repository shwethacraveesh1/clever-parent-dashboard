/**
 * Mailer interface: `sendMagicLink(email, url)`. The dev mailer prints the
 * link to the server console instead of sending email.
 */
export function createConsoleMailer(log = console.log) {
  return {
    async sendMagicLink(email, url) {
      log(`\n[magic link] for ${email}\n  ${url}\n`);
    },
  };
}
