# File Structure & Relevance Guide

## Architecture Overview

This service supports **two modes**:
1. **AWS Lambda (Cron-triggered)** - CloudWatch Events triggers Lambda, pulls from FIFO queue
2. **Standalone Node.js Service** - Continuous polling service (for ECS/Fargate/EC2)

## File Relevance by Mode

### For Lambda (Cron-Triggered) Mode ✅

**Core Files (REQUIRED):**
- ✅ `index.js` - Lambda handler entry point
- ✅ `src/services/cronProcessor.service.js` - Main processor for cron-triggered Lambda
- ✅ `src/services/sqs.service.js` - Pulls messages from FIFO queue
- ✅ `src/services/email.service.js` - Sends emails with retries
- ✅ `src/services/rateLimiter.service.js` - Per-domain rate limiting
- ✅ `src/services/metrics.service.js` - Metrics and observability
- ✅ `src/config/config.js` - Configuration
- ✅ `src/config/transporter.js` - Nodemailer SMTP transporter
- ✅ `src/config/logger.js` - Winston logger
- ✅ `src/config/db.js` - MongoDB connection (if needed)

**Dependency Chain:**
```
index.js (Lambda handler)
  └─> cronProcessor.service.js
      ├─> sqs.service.js (pull messages)
      ├─> email.service.js (send emails)
      │   ├─> rateLimiter.service.js
      │   ├─> metrics.service.js
      │   └─> transporter.js
      └─> metrics.service.js
```

### For Standalone Mode (Optional) 📦

**Additional Files (ONLY for standalone mode):**
- 📦 `src/services/smtp.js` - Orchestrates worker pool for continuous polling
- 📦 `src/services/workerPool.service.js` - Worker pool with infinite polling loop
  - Uses: `sqs.service.js`, `email.service.js`, `metrics.service.js`

**Standalone mode entry:**
- When running `node index.js` directly (not Lambda)
- Starts continuous polling service

### Not Currently Used ❌

**Unused Files:**
- ❌ `src/services/lambdaProcessor.service.js` - **NOT USED**
  - Was for SQS event source mapping (event-driven Lambda)
  - Not needed for cron-triggered Lambda
  - **Can be deleted if you only use cron triggers**

## Current Usage in index.js

```javascript
// Lambda handler (USED)
exports.handler = async (event, context) => {
    await cronProcessor.processQueue(context);  // ✅ USED
    // smtpEmailService NOT used here
}

// Standalone mode (USED if running node index.js)
if (require.main === module) {
    await smtpEmailService.start();  // ✅ USED for standalone
}
```

## File Size Impact for Lambda Deployment

### For Lambda-only deployment (recommended):

You can exclude from Lambda package:
- `src/services/lambdaProcessor.service.js` (unused)
- `src/services/smtp.js` (only standalone)
- `src/services/workerPool.service.js` (only standalone)

**serverless.yml patterns:**
```yaml
package:
  patterns:
    - "!src/services/lambdaProcessor.service.js"
    - "!src/services/smtp.js"
    - "!src/services/workerPool.service.js"
```

### If supporting both modes:

Keep all files - Lambda will include them but they won't be executed.

## Summary

**For your use case (Lambda + Cron triggers):**

| File | Used? | Why |
|------|------|-----|
| `cronProcessor.service.js` | ✅ YES | Main processor |
| `sqs.service.js` | ✅ YES | Pulls from queue |
| `email.service.js` | ✅ YES | Sends emails |
| `rateLimiter.service.js` | ✅ YES | Rate limiting |
| `metrics.service.js` | ✅ YES | Metrics |
| `smtp.js` | ❌ NO | Only standalone |
| `workerPool.service.js` | ❌ NO | Only standalone |
| `lambdaProcessor.service.js` | ❌ NO | For event source, not cron |

## Recommendation

**Option 1: Keep everything** (if you might use standalone mode later)
- All files stay, no changes needed
- Lambda includes unused files (minimal size impact)

**Option 2: Clean up for Lambda-only** (smaller package)
- Delete or exclude:
  - `lambdaProcessor.service.js`
  - Can keep `smtp.js` and `workerPool.service.js` if you want standalone option

**Option 3: Conditional loading** (optimized)
- Keep files but don't load unused ones in Lambda
- Update `index.js` to conditionally load only needed services

## Current Status

All files are present, but for Lambda deployment, only these are executed:
1. `index.js` → `cronProcessor.service.js` → pulls and processes messages

The unused files won't cause issues - they just won't be executed.

