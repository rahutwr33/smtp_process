# Gmail Bulk Email Deliverability Guide

## Overview

This service is optimized for bulk email sending to Gmail without getting blocked. It implements Gmail-specific best practices and deliverability improvements.

## Key Features Implemented

### 1. Conservative Rate Limiting

- **Gmail**: 15 emails/minute (below Gmail's ~20/min threshold)
- **Other providers**: Higher limits based on provider
- Prevents triggering Gmail's rate limit detection

### 2. RFC-Compliant Headers

- ✅ **Message-ID**: RFC 5322 compliant format
- ✅ **Date headers**: Proper UTC format with jitter to avoid patterns
- ✅ **MIME-Version**: Properly set
- ✅ **List-Unsubscribe**: Included for compliance (configure via `SMTP_LIST_UNSUBSCRIBE`)

### 3. Connection Pool Optimization

- **Max connections**: 10 (conservative for Gmail)
- **Messages per connection**: 50 (prevents connection abuse)
- **Connection pooling**: Always enabled for better performance
- **Socket timeout**: 30 seconds

### 4. Gmail-Specific Error Handling

- **421 (Service unavailable)**: Rate limit detected → Retry with backoff
- **450 (Greylisting)**: Temporary block → Retry after delay
- **Quota exceeded**: Temporary → Retry
- Proper exponential backoff with jitter

### 5. Enhanced Retry Logic

- Detects Gmail-specific error codes
- Handles temporary blocks gracefully
- Cooldown periods after rate limit errors

### 6. Deliverability Headers

- **Return-Path**: For bounce handling (configure via `SMTP_RETURN_PATH`)
- **Reply-To**: Separate reply address (configure via `SMTP_REPLY_TO`)
- **List-Unsubscribe**: Required for bulk emails (configure via `SMTP_LIST_UNSUBSCRIBE`)

## Configuration

### Required Environment Variables

```bash
# SMTP Settings
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=your-email@gmail.com
SMTP_POOL=true

# Deliverability Headers (Recommended)
SMTP_LIST_UNSUBSCRIBE=https://yoursite.com/unsubscribe
SMTP_REPLY_TO=support@yoursite.com
SMTP_RETURN_PATH=bounces@yoursite.com

# Connection Settings (Optional - defaults shown)
SMTP_MAX_CONNECTIONS=10  # Conservative for Gmail
SMTP_MAX_MESSAGES=50     # Messages per connection
```

## Gmail Requirements Checklist

### ✅ Domain Authentication

- **SPF Record**: Must be configured for your sending domain
- **DKIM Signing**: Recommended (configure via your SMTP provider)
- **DMARC Policy**: Recommended (p=none for testing, p=quarantine/p=reject for production)

### ✅ IP Reputation

- Use dedicated IP if possible (shared IPs can be affected by others)
- Warm up new IPs gradually (start with 50-100/day, increase slowly)
- Monitor bounce rates (<5% recommended)

### ✅ Email Content

- **HTML + Text**: Service auto-generates text version from HTML
- **Subject lines**: Avoid spam trigger words
- **Content**: Ensure legitimate business/personal emails
- **Links**: Use reputable domains, avoid URL shorteners

### ✅ Sending Behavior

- **Rate limiting**: Already implemented (15/min for Gmail)
- **Connection reuse**: Connection pooling enabled
- **Patterns**: Timestamps randomized to avoid patterns
- **Errors**: Proper retry logic with backoff

## Best Practices

### 1. Gradual Warm-up (New Domains/IPs)

If using a new sending domain or IP:

- **Week 1**: Start with 50-100 emails/day
- **Week 2**: Increase to 200-500/day
- **Week 3**: Increase to 1,000/day
- **Week 4+**: Gradually increase to target volume

### 2. Monitor Metrics

Watch these metrics:

- **Bounce rate**: Should be <5%
- **Complaint rate**: Should be <0.1% (1 per 1000)
- **Open rate**: Monitor for anomalies
- **Delivery rate**: Should be >95%

### 3. Handle Bounces

- **Hard bounces** (550): Remove immediately
- **Soft bounces** (451, 452): Retry with backoff
- **Rate limits** (421): Implement cooldown

### 4. List Hygiene

- Remove invalid emails regularly
- Honor unsubscribe requests immediately
- Monitor spam complaints
- Don't send to inactive subscribers

## Gmail-Specific Error Codes

| Code | Meaning                                       | Action                        |
| ---- | --------------------------------------------- | ----------------------------- |
| 421  | Service temporarily unavailable (rate limit)  | Retry after cooldown          |
| 450  | Mailbox temporarily unavailable (greylisting) | Retry after delay             |
| 451  | Mail server error                             | Retry with backoff            |
| 452  | Mailbox full                                  | Retry later                   |
| 550  | Mailbox unavailable (hard bounce)             | Don't retry, remove from list |
| 552  | Message too large                             | Don't retry                   |

## Testing Before Bulk Send

1. **Send test emails** to Gmail accounts
2. **Check spam folder**: Ensure emails land in inbox
3. **Monitor headers**: Verify SPF/DKIM/DMARC pass
4. **Test unsubscribe**: Verify List-Unsubscribe works
5. **Check bounce handling**: Verify hard bounces are removed

## Monitoring

### CloudWatch Metrics to Watch

1. **Emails per minute** to Gmail
   - Should stay below 15/min
2. **Error rate** (421, 450 errors)
   - Spike indicates rate limiting
3. **Retry count**
   - High retries = issues
4. **Delivery time**
   - Should be <5 seconds per email

### Log Queries

```sql
-- Find Gmail rate limit errors
fields @timestamp, level, message, responseCode, to
| filter level = "ERROR" and responseCode = 421
| sort @timestamp desc

-- Monitor Gmail sending rate
fields @timestamp, domain, recentCount, limit
| filter domain = "gmail.com" or domain = "googlemail.com"
```

## Troubleshooting

### Gmail Blocking Emails

**Symptoms:**

- High bounce rate to Gmail
- Emails going to spam
- 421 errors increasing

**Solutions:**

1. Reduce rate limit further (try 10/min)
2. Check SPF/DKIM/DMARC records
3. Review email content for spam triggers
4. Warm up IP/domain gradually
5. Remove bad email addresses

### High Retry Rate

**Symptoms:**

- Many emails being retried
- 450/451 errors common

**Solutions:**

1. Increase cooldown periods
2. Reduce sending rate
3. Check SMTP server status
4. Verify network connectivity

## Additional Resources

- [Gmail Bulk Sender Guidelines](https://support.google.com/mail/answer/81126)
- [SPF Record Setup](https://support.google.com/a/answer/10684623)
- [DKIM Setup](https://support.google.com/a/answer/174124)
- [DMARC Setup](https://support.google.com/a/answer/2466580)

## Summary

This implementation includes:

- ✅ Conservative rate limiting (15/min for Gmail)
- ✅ RFC-compliant headers
- ✅ Proper error handling
- ✅ Connection pooling
- ✅ Deliverability headers
- ✅ Retry logic with backoff
- ✅ Gmail-specific optimizations

Follow the configuration guidelines and monitor metrics to maintain high deliverability to Gmail.
