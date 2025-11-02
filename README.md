#campaign starter

serverless deploy --config serverless.yml --stage dev

serverless package --config serverless.yml --stage dev

serverless offline --config serverless.yml --httpPort=8000

