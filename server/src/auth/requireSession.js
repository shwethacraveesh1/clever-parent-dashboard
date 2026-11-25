/**
 * Sets req.guardianId from the session cookie, or responds 401.
 * This is the only place a guardian ID enters a request.
 */
export function requireSession({ sessionStore, cookieName }) {
  return (req, res, next) => {
    const session = sessionStore.get(req.cookies?.[cookieName]);
    if (!session) {
      res.status(401).json({ error: 'unauthenticated' });
      return;
    }
    req.guardianId = session.guardianId;
    next();
  };
}
