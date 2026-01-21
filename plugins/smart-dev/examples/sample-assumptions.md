## Unresolved Gaps

The following information gaps remain after 2 rounds of Q&A:

1. **Performance requirements** (constraints): No specific latency/throughput targets mentioned
   - Current spec: "Should be fast"
   - Needed: Concrete SLA (e.g., "p95 latency < 200ms for token refresh")

2. **Error logging strategy** (verification): No logging/monitoring approach specified
   - Current spec: Silent on observability
   - Needed: What errors to log, where (stdout, file, monitoring service)

3. **Token storage cleanup** (constraints): No strategy for removing expired tokens from redis
   - Current spec: Tokens added to blacklist, no mention of cleanup
   - Needed: TTL strategy or cleanup cron job

## Proposed Assumptions

### Gap: Performance requirements
**Assumption**: Target p95 latency < 500ms for all auth endpoints (login, refresh, logout) under normal load (<100 req/s)
**Risk**: May not meet user expectations if they need sub-100ms response. Could require optimization later.

### Gap: Error logging strategy
**Assumption**: Log auth failures (invalid credentials, expired tokens) to console with structured JSON format. Use existing app logger.
**Risk**: May not be sufficient for production debugging. Might need external monitoring service integration later.

### Gap: Token storage cleanup
**Assumption**: Use redis TTL to auto-expire blacklisted tokens (match refresh token TTL of 7 days). No manual cleanup needed.
**Risk**: Redis memory usage could grow if TTLs not set correctly. Monitoring needed.

## Acceptance

User decision required:

- [ ] **Accept assumptions and proceed** (Recommended if risks are acceptable)
  - Implementation can start with these assumptions
  - Can refine in Phase 5 review if issues found

- [ ] **Provide more information** (will ask targeted questions)
  - Need specific answers to gaps above
  - Will use remaining question budget (if available)

## Notes

- These assumptions are **documented here** for future reference
- If accepted, they become part of the specification
- Can be updated post-implementation based on real-world performance
- Risk level: **Low to Medium** (mostly about optimization, not core functionality)
