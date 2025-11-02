# CloudWatch Cron Timing Guide for FIFO Queue

## Overview

This service uses CloudWatch Events (EventBridge) to trigger Lambda periodically. Each Lambda invocation pulls messages from the FIFO SQS queue and processes them until timeout or queue is empty.

## Cron Timing Recommendations

### Target: 35 emails/sec sustained = 2,100 emails/minute

### Calculation

**Lambda Capacity:**

- Timeout: 15 minutes (900 seconds)
- Processing time per email: ~2-5 seconds (including retries, rate limiting)
- Concurrent processing: 10 emails at a time
- **Capacity per Lambda**: ~3,000-4,500 emails per 15-minute window

**Recommended Cron Frequency:**

| Cron Frequency       | Messages/Trigger | Total Capacity/Min | Notes                                                |
| -------------------- | ---------------- | ------------------ | ---------------------------------------------------- |
| **Every 30 seconds** | ~1,050           | ~2,100/min         | ✅ **Recommended** - Matches exact throughput needed |
| **Every 1 minute**   | ~2,100           | ~2,100/min         | ✅ **Default** - Simple, sufficient for target       |
| **Every 2 minutes**  | ~4,200           | ~2,100/min         | Good for steady state, queue may build during spikes |

### Recommended Configuration

**For 35 emails/sec (2,100 emails/minute):**

```yaml
events:
  - schedule:
      rate: rate(1 minute) # Every 1 minute
      # or
      # rate: rate(30 seconds)  # Every 30 seconds for lower queue depth
```

**Cron Expression Alternatives:**

```yaml
# Every minute
rate: rate(1 minute)
# or
rate: cron(*/1 * * * ? *)

# Every 30 seconds (if supported by EventBridge)
rate: rate(30 seconds)  # Note: Minimum is 1 minute for standard EventBridge

# Every 2 minutes
rate: rate(2 minutes)
# or
rate: cron(*/2 * * * ? *)
```

### Important: FIFO Queue Limitations

**SQS FIFO Queue Limits:**

- **300 messages/second** per queue (18,000/min) - ✅ Well above our 2,100/min target
- **3,000 messages/second** with batching (10 messages per API call)
- Messages processed in order (MessageGroupId)

**Lambda Constraints:**

- Maximum timeout: 15 minutes
- Each invocation processes until timeout or queue empty
- With cron every 1 minute, can have up to 15 concurrent invocations

### Optimizing for Different Scenarios

#### Scenario 1: Steady 35 emails/sec

```
Cron: Every 1 minute
Expected: ~2,100 emails processed per trigger
Result: Queue stays near empty, steady processing
```

#### Scenario 2: Bursty traffic (spikes)

```
Cron: Every 30 seconds (if possible) or every 1 minute
Expected: Lambda processes available messages
Result: Queue builds during spikes, cleared during steady state
```

#### Scenario 3: Lower throughput (10-20 emails/sec)

```
Cron: Every 2 minutes
Expected: ~1,200-2,400 emails processed per trigger
Result: Lower Lambda invocations, cost-effective
```

### Monitoring & Adjustment

**Key Metrics to Watch:**

1. **Queue Depth** (`ApproximateNumberOfMessages`)

   - Should stay near 0 for steady state
   - If consistently > 1000: Reduce cron interval or increase Lambda concurrency

2. **Lambda Duration**

   - Should use most of 15-minute timeout if queue has messages
   - If consistently < 5 minutes: Queue may be empty, consider less frequent cron

3. **Throughput**
   - Monitor `sqsMessagesProcessed` metric
   - Target: ~2,100 per minute sustained

### serverless.yml Configuration

```yaml
functions:
  app:
    handler: index.handler
    timeout: 900 # 15 minutes
    memorySize: 3008 # 3GB
    reservedConcurrentExecutions: 5 # Limit concurrent Lambdas
    events:
      - schedule:
          rate: rate(1 minute) # Adjust based on your needs
          enabled: true
```

### Advanced: Dynamic Scaling

For variable workloads, consider:

- **Option 1**: Multiple cron schedules (different frequencies for different times)
- **Option 2**: Step Functions to check queue depth and trigger Lambda if needed
- **Option 3**: EventBridge + SQS integration (Lambda triggered when queue depth > threshold)

### Cost Optimization

**Cost per 1M emails:**

- Lambda: ~$0.50 (with 3GB, 15-min timeout)
- SQS: ~$0.40
- **Total: ~$0.90 per 1M emails**

**At 35 emails/sec (3M/day):**

- Lambda invocations: ~4,320/day (1 per minute)
- Monthly cost: ~$65 (Lambda) + ~$36 (SQS) = **~$101/month**

### Recommended Final Configuration

```yaml
# For 35 emails/sec sustained throughput
rate: rate(1 minute) # Triggers every minute
timeout: 900 # 15 minutes
reservedConcurrentExecutions: 5 # Allow 5 concurrent invocations
```

This ensures:

- ✅ Queue is checked every minute
- ✅ Each Lambda can process ~3,000+ emails if queue is full
- ✅ Queue depth stays low
- ✅ Meets 35 emails/sec target comfortably
