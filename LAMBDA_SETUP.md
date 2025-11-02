# AWS Lambda Deployment Guide

## Overview

This email processing service is optimized for AWS Lambda with SQS event source mapping. Lambda automatically invokes the function when messages arrive in the SQS queue.

## Architecture

**Event Flow:**

```
SQS Queue → Lambda (Event Source Mapping) → Email Processing → SMTP Server
```

**Key Benefits:**

- ✅ **No polling loops** - Lambda is triggered automatically by SQS
- ✅ **Automatic scaling** - Lambda scales based on queue depth
- ✅ **Cost-effective** - Pay only for actual invocations
- ✅ **Built-in retries** - SQS handles message visibility timeout and retries
- ✅ **Partial batch failures** - Only failed messages are retried

## Configuration

### 1. Environment Variables

Add to your `serverless.yml` or Lambda configuration:

```yaml
environment:
  SQS_QUEUE_ARN: arn:aws:sqs:ap-south-1:014498623548:your-queue-name
  SQS_QUEUE_NAME: your-queue-name # Alternative if using queue name
  SQS_DLQ_URL: arn:aws:sqs:ap-south-1:014498623548:your-dlq-name # Optional
  # ... other env vars
```

### 2. Serverless.yml Setup

The service uses SQS event source mapping:

```yaml
functions:
  app:
    handler: index.handler
    timeout: 900 # 15 minutes max
    memorySize: 3008 # 3GB for high throughput
    reservedConcurrentExecutions: 10 # Control concurrency
    events:
      - sqs:
          arn: ${env:SQS_QUEUE_ARN}
          batchSize: 10 # Process up to 10 messages per invocation
          maximumBatchingWindowInSeconds: 5
          functionResponseType: ReportBatchItemFailures
```

### 3. IAM Permissions

Lambda needs these SQS permissions:

```yaml
iam:
  role:
    statements:
      - Effect: Allow
        Action:
          - sqs:ReceiveMessage
          - sqs:DeleteMessage
          - sqs:GetQueueAttributes
          - sqs:GetQueueUrl
          - sqs:SendMessage # For DLQ
        Resource:
          - arn:aws:sqs:*:*:your-queue-name
          - arn:aws:sqs:*:*:your-dlq-name
```

## How It Works

### Message Processing Flow

1. **SQS Event Trigger**: When messages arrive in SQS, Lambda is automatically invoked
2. **Batch Processing**: Lambda receives up to 10 messages per invocation (configurable)
3. **Parallel Processing**: Messages are processed concurrently (up to 10 per invocation)
4. **Success Handling**: Successful messages are deleted from SQS
5. **Failure Handling**:
   - **Transient failures**: Returned in `batchItemFailures` for selective retry
   - **Permanent failures**: Sent to DLQ and deleted from main queue

### Partial Batch Failures

The service supports partial batch failure reporting:

- Only failed messages are retried (not the entire batch)
- Permanent failures go to DLQ immediately
- Transient failures are retried via SQS visibility timeout

## Performance Tuning

### Lambda Configuration

```yaml
timeout: 900 # 15 minutes (max)
memorySize: 3008 # 3GB (more memory = more CPU)
reservedConcurrentExecutions: 10 # Limit concurrent invocations
```

### Throughput Calculation

With current settings:

- **Per invocation**: 10 messages max
- **Concurrent executions**: 10
- **Processing time**: ~2-5 seconds per message (including retries)
- **Theoretical max**: ~20-50 emails/second

For **35 emails/sec** sustained:

- Increase `reservedConcurrentExecutions` to 5-7
- Ensure `batchSize: 10` is set
- Monitor Lambda concurrency metrics

### SQS Configuration

- **Visibility Timeout**: Should be > Lambda timeout (set to ~960 seconds)
- **Message Retention**: 14 days (default)
- **Dead Letter Queue**: Configure for failed messages

## Monitoring

### Key Metrics

1. **Lambda Metrics**:

   - `Invocations` - Total Lambda invocations
   - `Duration` - Processing time per invocation
   - `Errors` - Failed invocations
   - `ConcurrentExecutions` - Current concurrency

2. **SQS Metrics**:

   - `ApproximateNumberOfMessages` - Queue depth
   - `ApproximateNumberOfMessagesNotVisible` - In-flight messages
   - `NumberOfMessagesSent` - Throughput

3. **Application Metrics** (via CloudWatch Logs):
   - Emails sent per minute
   - SMTP error rate
   - Retry counts
   - DLQ messages

### CloudWatch Dashboards

Create dashboards to monitor:

- Queue depth over time
- Lambda concurrency
- Email success/failure rates
- Processing latency

## Troubleshooting

### High Queue Depth

- Increase `reservedConcurrentExecutions`
- Check for Lambda throttling
- Verify SMTP connection pooling is working
- Check rate limiting isn't too aggressive

### Lambda Timeouts

- Increase `timeout` value
- Optimize email sending (check SMTP connection timeouts)
- Reduce `batchSize` if processing takes too long

### Message Duplicates

- Check idempotency is working (24-hour window)
- Verify SQS visibility timeout > Lambda timeout
- Ensure messages are deleted only after successful send

## Deployment

```bash
# Install dependencies
npm install

# Deploy to AWS
serverless deploy --stage prod

# Or deploy specific function
serverless deploy function -f app --stage prod
```

## Local Testing

For local testing without Lambda:

```bash
npm start  # Uses standalone mode with polling
```

## Cost Considerations

**Lambda Costs:**

- Pay per invocation + compute time
- With 3M emails/day @ 10 messages/batch = 300K invocations/day
- At 3GB memory, ~$0.50 per million invocations

**SQS Costs:**

- First 1M requests/month free
- ~$0.40 per million requests

**Total Estimated Cost**: ~$150-200/month for 3M emails/day

## Alternative: Standalone Mode

If you prefer a long-running service (ECS/Fargate/EC2):

```bash
npm start  # Starts continuous polling service
```

This uses the worker pool service with infinite polling loop.
