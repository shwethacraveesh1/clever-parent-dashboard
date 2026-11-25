/**
 * Append-only audit log for student-data access. One JSON object per line.
 *
 * Records only: ts, guardianId, studentId, outcome ("viewed" | "denied").
 * No student names, no request bodies, no stack traces.
 *
 * @param {{ write?: (line: string) => void, now?: () => number }} [options]
 */
export function createAuditLogger({ write = defaultWrite, now = Date.now } = {}) {
  return {
    /**
     * @param {{ guardianId: string, studentId: string, outcome: 'viewed' | 'denied' }} entry
     */
    record({ guardianId, studentId, outcome }) {
      write(
        `${JSON.stringify({
          ts: new Date(now()).toISOString(),
          guardianId,
          studentId,
          outcome,
        })}\n`,
      );
    },
  };
}

function defaultWrite(line) {
  process.stdout.write(line);
}
