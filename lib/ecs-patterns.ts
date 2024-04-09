import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as ecsPatters from 'aws-cdk-lib/aws-ecs-patterns'

export class FargateEcsPatternsStack extends cdk.Stack {

    constructor(scope: Construct, id: string, props: cdk.StackProps = {}) {
        super(scope, id, props);

        const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef',{});
        const container = taskDefinition.addContainer('nginx', {
            image: ecs.ContainerImage.fromRegistry("public.ecr.aws/nginx/nginx"),
            memoryLimitMiB: 256,
            logging: new ecs.AwsLogDriver({
                streamPrefix: 'nginx'
            })
        });

        container.addPortMappings({
            containerPort: 80,
            protocol: ecs.Protocol.TCP
        });


        new ecsPatters.ApplicationMultipleTargetGroupsFargateService(this, "AppMulTargetGroupsFargate", {taskDefinition})
        new ecsPatters.NetworkLoadBalancedFargateService(this, "NetworkLBFargate", {taskDefinition})
        new ecsPatters.NetworkMultipleTargetGroupsFargateService(this,"NetworkMulTargetGroupsFargate",{taskDefinition})
        new ecsPatters.QueueProcessingFargateService(this,"QueueProcessingFargate",{taskDefinition})

   }
}
