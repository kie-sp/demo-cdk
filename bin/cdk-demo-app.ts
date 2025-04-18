import {App, StackProps} from 'aws-cdk-lib';
import { CdkDemoStack } from '../lib/cdk-demo-stack';
import { randomUUID } from 'crypto';

const app = new App();
const env = app.node.tryGetContext('env');

interface CdkDemoAppStackProps extends StackProps {
    deploymentEnv?: string;
  }

const id = `CdkDemoStack-${randomUUID().slice(0, 8)}`;
console.log(`Deploymnet id: ${id}`)
const deploymentEnv = env; 

new CdkDemoStack(app, id,{
    env : deploymentEnv
});






