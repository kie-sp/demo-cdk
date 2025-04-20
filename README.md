# 🚀 CDK Web Infra Setup

This project demonstrates how to deploy a simple static web infrastructure using AWS CDK.  
It's designed for cases where you need to **move to a new AWS account** and want to bootstrap essential infrastructure automatically.

---

## 🔧 What’s included

- 🛠 **GitHub** as the source control  
- 🧪 **CodePipeline** to orchestrate the CI/CD process  
- 🧱 **CodeBuild** for building and exporting the Next.js app  
- 📦 **S3** for hosting the exported static site  
- 🌐 **CloudFront** for caching & secure distribution  
- 🔔 **SNS** for pipeline notifications  
- 📁 **Environment-specific config** with YAML files like `dev.yaml`, `uat.yaml`, etc.

---

## 🗂 Directory Structure

```bash
.
├── lib/
│   └── cdk-demo-stack.ts       # Main CDK stack
│   └── source/config/
│       ├── dev.yaml            # Config for dev
│       ├── uat.yaml            # Config for UAT
├── buildspec.yaml              # CodeBuild spec
├── README.md                   # This file
```

---

## 🧙 How it works

1. **Read Config**  
   Reads environment-specific config file like `dev.yaml`.

2. **S3 Bucket**  
   - Creates a bucket (if not exists)  
   - Blocks public access  
   - Adds project/env tags
   - Attach explicit s3:GetObject permission for CloudFront using bucket policy

3. **CloudFront**  
   - Linked to S3 with OAC (Origin Access Control)  
   - Custom cache policy  
   - Error handling: show `/index.html` for 403/404

4. **CodeBuild**  
   - Using existing IAM role
   - Runs `next build` + `next export`  
   - Deploys to S3 bucket

5. **CodePipeline**  
   - Triggers from GitHub  
   - Connects to CodeBuild  
   - Sends result to SNS

---

## 🚀 Deploy

> You can pass the environment (e.g. `dev`, `uat`) as a context variable

```bash
cdk deploy --context env=dev
```

---

## 📦 Sample `dev.yaml`

```yaml
stack_name: dev
project_name: demo-web
repository:
  owner: kiesp
  repo_name: awesome-web
s3Bucket:
  name: demo-web-dev
  is_existing: false
cloudfront:
  description: 'Dev distribution'
  cache_policy:
    name: demo-cache
    description: '2d TTL, with compression'
codebuild:
  name: demo-build
  is_existing: false
  build_source: ../buildspec.yaml
codebuild_iam_role:
  role_name: arn:aws:iam::<ACCOUNT_ID>:role/demo-role
codepipeline:
  name: demo-pipeline
  commit_stage:
    name: Source
    action_name: GitHubSource
  build_stage:
    name: Build
    action_name: BuildApp
  s3bucket: demo-web-dev
codestar_connection:
  name: arn:aws:codestar-connections:<region>:connection/<id>
notification:
  topic_arn: arn:aws:sns:<region>:<account>:demo-topic
notify_rule:
  is_existing: false
```

---

Built with ☕, 💪, and too many failed deployments...

Created by Kie SP

---

## 💬 Questions?

Feel free to open an issue or connect on Instagram:  
📸 [@codewithkiefreewifi](https://www.instagram.com/codewithkiefreewifi)
