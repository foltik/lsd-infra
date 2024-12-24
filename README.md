# LSD Cloud Infrastructure

## Bootstrap (AWS)
1. Connect GitHub actions to AWS
  - Log into AWS Management Console as root and go to the IAM dashboard
  - Create a user named "actions", choosing "Attach policies directly" and adding "AdministratorAccess"
  - Go to the "Security credentials" tab of the newly created user and create an access key of type "Other"
  - Open the GitHub repo settings and go to "Actions" in the "Secrets and variables" section
  - Create secrets AWS_ACCESS_KEY and AWS_SECRET_KEY with the values from the newly created access key

2. Setup Terraform state persistence
  - Open the S3 console and create a new bucket (e.g., tfstate) with versioning enabled
  - Open the DynamoDB Console and create a new table (e.g. tfstate-lock)
  - Add a partition key with the name LockID and type String.
  - Update `main.tf` file with the bucket and table names

2. Create remaining GitHub secrets
  - TODO

3. Push a commit to the repo to trigger the GitHub action

4. ???

5. Profit
