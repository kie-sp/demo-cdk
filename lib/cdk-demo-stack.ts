import * as path from 'path';
import * as yaml from 'yaml';
import * as fs from 'fs'
import { Duration, Stack, StackProps,RemovalPolicy,aws_codepipeline_actions } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
//import { App, aws_codepipeline_actions, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import {S3BucketOrigin} from 'aws-cdk-lib/aws-cloudfront-origins'
import * as sns from 'aws-cdk-lib/aws-sns';
import * as noti from 'aws-cdk-lib/aws-codestarnotifications';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { LinuxBuildImage } from 'aws-cdk-lib/aws-codebuild';


export class CdkDemoStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const env = props?.env ?? 'dev';

    console.log(`createing for enviroment: ${env}`)

    try {
      //read from configuration file
      const configfile: string = fs.readFileSync(path.join(__dirname, `/source/config/${env}.yaml`), { encoding: 'utf-8', }); 
      const configData: any = yaml.parse(configfile);
      const repositoryData = configData.repository;

      //create s3 bucket for hosting static web
      const s3ConfigData = configData.s3Bucket;
      let bucket: any = {}
      if(!s3ConfigData.is_existing) {
        bucket = new s3.Bucket(this, `${id}-bucket`, {
          bucketName : s3ConfigData.name,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        });

        cdk.Tags.of(bucket).add('Project', s3ConfigData.name);
        cdk.Tags.of(bucket).add('Environment', configData.stack_name);
      } else {
        bucket = s3.Bucket.fromBucketName(this, `${id}-bucket`, s3ConfigData.name);
      }

        //create cloudfront
        const cloudFrontData = configData.cloudfront;

        //create cache policy for cloudfront
        const webCachePolicy = new cloudfront.CachePolicy(this, `${id}-policy`, {
          cachePolicyName: cloudFrontData.cache_policy.name,
          comment: cloudFrontData.cache_policy.description,
          defaultTtl: Duration.days(2),
          minTtl: Duration.minutes(1),
          maxTtl: Duration.days(10),
        })


        const oac = new cloudfront.CfnOriginAccessControl(this, `${id}-oac`, {
          originAccessControlConfig: {
            name: `${id}-oac`,
            originAccessControlOriginType: 's3',
            signingBehavior: 'always',
            signingProtocol: 'sigv4',
            description: 'OAC for S3',
          },
        });

        const bucketDomain = cdk.Fn.join('', [bucket.bucketName,'.s3.',cdk.Aws.REGION,'.amazonaws.com']);
        
        console.log(`bucketDomain: ${bucketDomain}`)

        const distribution = new cloudfront.CfnDistribution(this, `${id}-distribution`, {
          distributionConfig: {
            enabled: true,
            defaultRootObject: 'index.html',
            comment: cloudFrontData.description,
            origins: [
              {
                domainName: bucketDomain,
                id: `${id}-origin-bucket`,
                originAccessControlId: oac.attrId,
                s3OriginConfig: {
                  originAccessIdentity: '', 
                },
              },
            ],
            defaultCacheBehavior: {
              targetOriginId: `${id}-origin-bucket`,
              viewerProtocolPolicy: 'https-only',
              allowedMethods: ['GET', 'HEAD'],
              cachedMethods: ['GET', 'HEAD'],
              compress: true,
              cachePolicyId: webCachePolicy.cachePolicyId,
              originRequestPolicyId: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN.originRequestPolicyId,
            },
            customErrorResponses: [
              {
                errorCode: 403,
                responseCode: 200,
                responsePagePath: '/index.html',
                errorCachingMinTtl: 10,
              },
              {
                errorCode: 404,
                responseCode: 200,
                responsePagePath: '/index.html',
                errorCachingMinTtl: 10,
              }
            ]
          }
        });

        bucket.addToResourcePolicy(new iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: [`${bucket.bucketArn}/*`],
          principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
          conditions: {
            StringEquals: {
              'AWS:SourceArn': `arn:aws:cloudfront::${cdk.Aws.ACCOUNT_ID}:distribution/${distribution.ref}`,
            },
          },
        }));

        cdk.Tags.of(distribution).add('Project', configData.project_name);
        cdk.Tags.of(distribution).add('Environment', configData.stack_name);

        //Create codebuild with existing IAM role
        let project: any = {}
        let codeBuildData = configData.codebuild
        let codeBuildIAMRole = configData.codebuild_iam_role
        const build_spec_file: string = fs.readFileSync(path.join(__dirname, codeBuildData.build_source), { encoding: 'utf-8', });
        const parsed: any = yaml.parse(build_spec_file);

        const importedRole = iam.Role.fromRoleArn(
          this,
          `${id}-iamrole`,
          codeBuildIAMRole.role_name,
          { mutable: false },
        );

      if (!codeBuildData.is_existing) {
        console.log("build new codebuild")
        project = new codebuild.Project(this, `${id}-codebuild`, {
          projectName: codeBuildData.name,
          buildSpec: codebuild.BuildSpec.fromObjectToYaml(parsed),
          role: importedRole,
          environment: {
            buildImage: LinuxBuildImage.STANDARD_7_0,
            computeType: codebuild.ComputeType.SMALL
          },

          source: codebuild.Source.gitHub({
            owner: repositoryData.owner,
            repo: repositoryData.repo_name,
            webhook: false,
            reportBuildStatus: true,
          })

        })
        cdk.Tags.of(project).add('Project', codeBuildData.name);
        cdk.Tags.of(project).add('Environment', configData.stack_name);

      } else {
        console.log("use exiting codebuild")
        let codebuildExisting = codebuild.Project.fromProjectName(this, `${id}-codebuild`, codeBuildData.name)
        project = codebuildExisting
      }

      //create codepipeline
      let codepipelineData = configData.codepipeline;
      let codestarData = configData.codestar_connection;
      const repoOutput = new codepipeline.Artifact();

      const s3aArtifactBucket = s3.Bucket.fromBucketName(this, `${id}-artifacts-bucket`, configData.artifacts_bucket);
      const pipeline = new codepipeline.Pipeline(this, `${id}-codepipeline`, {
        artifactBucket: s3aArtifactBucket,
        pipelineName: codepipelineData.name,
        stages: [{
          stageName: codepipelineData.commit_stage.name,
          actions: [new aws_codepipeline_actions.CodeStarConnectionsSourceAction({
            actionName: codepipelineData.commit_stage.action_name,
            owner: repositoryData.owner,
            repo: repositoryData.repo_name,
            output: repoOutput,
            branch: configData.stack_name,
            connectionArn : codestarData.name
          })]
        }, {
          stageName: codepipelineData.build_stage.name,
          actions: [new aws_codepipeline_actions.CodeBuildAction({
            actionName: codepipelineData.build_stage.action_name,
            input: repoOutput,
            project: project,
            environmentVariables: {
              ENV: {
                value: configData.stack_name
              },
              S3BUCKET: {
                value: codepipelineData.s3bucket
              }
            }
          })],
        }]
      });

      cdk.Tags.of(pipeline).add('Project', codeBuildData.name);
      cdk.Tags.of(pipeline).add('Environment', configData.stack_name);
      //set up notification from existing sns

      const notiData = configData.notification
      const notifyRuleData = configData.notify_rule
      const notiTopic = sns.Topic.fromTopicArn(this, `${id}-notification`, notiData.topic_arn);

      if(!notifyRuleData.is_existing) {

        const newRule = new noti.NotificationRule(this, `${id}-notify`, {
          detailType: noti.DetailType.FULL,
          notificationRuleName: `${id}-notify`,
          events: [
            'codepipeline-pipeline-pipeline-execution-failed',
            'codepipeline-pipeline-pipeline-execution-succeeded',
          ],
          source: pipeline,
          targets: [notiTopic],
        });

        cdk.Tags.of(newRule).add('Project', codeBuildData.name);
        cdk.Tags.of(newRule).add('Environment', configData.stack_name);
  
      } else {
        noti.NotificationRule.fromNotificationRuleArn(this,`${id}-notify`,notifyRuleData.notify_arn);
      }


      console.log(`let's create this....😄`)


    } catch (exception) {
      console.error(`🚨 Something failed: ${env} \nbut that's fine. pls see below for more information 😃`);
      console.error(exception);
      throw exception;
    }
  }
}
