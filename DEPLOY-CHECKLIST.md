# Deployment Checklist - WebSocket Hotfix

## Pre-Deployment

- [x] Code changes completed
- [x] Linting errors fixed
- [x] Documentation updated (CHANGELOG.md, HOTFIX document)
- [ ] Local testing performed
- [ ] Build successful

## Build Commands

```bash
# Navigate to project directory
cd C:\Users\chris\Desktop\kv-manager

# Install dependencies (if needed)
npm install

# Build frontend
npm run build

# Deploy worker
wrangler deploy
```

## Post-Deployment Verification

### Immediate Checks (First 5 minutes)

- [ ] Check Cloudflare Workers dashboard for errors
- [ ] Monitor 429 error rate in Analytics
- [ ] Verify application loads without console errors
- [ ] Check WebSocket connection behavior:
  - [ ] No connections on initial page load
  - [ ] No connections when no operations are running

### Functional Testing (First 15 minutes)

- [ ] **Test Bulk Delete**:
  1. Select keys
  2. Click "Delete Selected"
  3. Verify progress dialog appears
  4. Verify WebSocket connection shows "WebSocket" status
  5. Wait for completion
  6. Verify dialog auto-closes
  7. Verify keys are deleted

- [ ] **Test Bulk Copy**:
  1. Select keys
  2. Click "Copy to Namespace"
  3. Verify progress dialog appears
  4. Verify real-time progress updates
  5. Wait for completion
  6. Verify keys copied successfully

- [ ] **Test Import/Export**:
  1. Export a namespace
  2. Verify progress dialog appears
  3. Wait for completion
  4. Verify file downloads automatically
  5. Import the file
  6. Verify progress dialog appears
  7. Verify import completes successfully

### Monitoring (First Hour)

- [ ] Check Cloudflare Analytics dashboard
  - [ ] Request rate has normalized
  - [ ] No sustained 429 errors
  - [ ] WebSocket connection count is reasonable

- [ ] Check Worker logs
  - [ ] No repeated "Skipping connection - missing wsUrl or jobId" messages when idle
  - [ ] Successful WebSocket connections during operations
  - [ ] No error spikes

- [ ] Check browser console (multiple browsers)
  - [ ] Chrome/Edge
  - [ ] Firefox
  - [ ] Safari

## Rollback Plan (If Issues Occur)

If the hotfix doesn't resolve the issue or causes new problems:

```bash
# Revert to previous deployment
wrangler rollback

# Or deploy previous version from git
git checkout <previous-commit-hash>
npm run build
wrangler deploy
```

## Success Criteria

✅ **Hotfix is successful if:**
1. No 429 errors in Cloudflare Analytics
2. WebSocket connections only occur during active operations
3. No console errors on page load
4. All bulk operations complete successfully with real-time progress
5. Request rate is within normal limits (< 100 requests/minute for idle)

❌ **Rollback if:**
1. 429 errors continue
2. Application becomes unresponsive
3. Bulk operations fail to start
4. Critical functionality breaks
5. New unexpected errors appear

## Communication

### If Successful
- Update issue tracker
- Mark hotfix as deployed in CHANGELOG
- Monitor for 24 hours

### If Issues Persist
- Document new errors
- Check `HOTFIX-websocket-connection-loop.md` for additional context
- Review Cloudflare Workers logs
- Consider rate limiting on Worker side
- May need to add additional guards or disable WebSocket temporarily

## Notes

- This fix addresses a critical production issue
- No version bump required (unreleased feature)
- Monitor closely for first 24 hours
- Consider adding integration tests for WebSocket lifecycle

