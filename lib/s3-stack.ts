import * as path from 'path';
import * as yaml from 'yaml';
import * as fs from 'fs'
import { Stack, StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';


export class S3stack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    const env = props?.env ?? 'dev';
    console.log(`createing for enviroment: ${env}`)
    try {
      //read from configuration file
      const configfile: string = fs.readFileSync(path.join(__dirname, `/source/config/${env}.yaml`), 
      { encoding: 'utf-8', }); 
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
      console.log(`let's create this....😄`)

    } catch (exception) {
      console.error(`🚨 Something failed: ${env} \npls see below for more information 😃`);
      console.error(exception);
      throw exception;
    }
  }
}
