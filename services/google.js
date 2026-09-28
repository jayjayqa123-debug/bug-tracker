// Verifies the ID token that Google's sign-in button hands to the browser.
// The token is checked against Google's public keys, so it cannot be faked.
const { OAuth2Client } = require('google-auth-library');

async function verify(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  const p = ticket.getPayload();
  return {
    googleId: p.sub,
    email: p.email,
    emailVerified: !!p.email_verified,
    name: p.name || p.email
  };
}

module.exports = { verify };
