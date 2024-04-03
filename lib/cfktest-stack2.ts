import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as efs from 'aws-cdk-lib/aws-efs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'

const app = new cdk.App();

export class SharedStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: ecs.Cluster;

  constructor(scope: Construct, id: string, props: cdk.StackProps = {}) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });

    const cluster = new ecs.Cluster(this, 'EcsCluster', { vpc });
    cluster.addCapacity('DefaultAutoScalingGroup', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO)
    });

    // Define a filesystem to hold durable content
    const fileSystem = new efs.FileSystem(this, 'Filesystem', {
      vpc,
      lifecyclePolicy: efs.LifecyclePolicy.AFTER_14_DAYS, // files are not transitioned to infrequent access (IA) storage by default
      performanceMode: efs.PerformanceMode.GENERAL_PURPOSE, // default
      outOfInfrequentAccessPolicy: efs.OutOfInfrequentAccessPolicy.AFTER_1_ACCESS, // files are not transitioned back from (infrequent access) IA to primary storage by default
    });

    // Create Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDef');
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

    // Add the Elastic File System to the task
    taskDefinition.addVolume({
      name: 'web-content',
      efsVolumeConfiguration: {
        fileSystemId: fileSystem.fileSystemId,
        rootDirectory: '/',
        transitEncryption: 'ENABLED'
      }
    })

    // Add a policy to the task definition allowing it to point the Elastic File System
    const efsMountPolicy = (new iam.PolicyStatement({
      actions: [
        'elasticfilesystem:ClientMount',
        'elasticfilesystem:ClientWrite',
        'elasticfilesystem:ClientRootAccess'
      ],
      resources: [
        fileSystem.fileSystemArn
      ]
    }))
    taskDefinition.addToTaskRolePolicy(efsMountPolicy)

    // And add the task's filesystem to the container
    container.addMountPoints({
      containerPath: '/usr/share/nginx/html',
      readOnly: false,
      sourceVolume: 'web-content'
    })

    // Create Service
    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 2,
      enableExecuteCommand: true
    });

    // Ensure that the service has access to communicate to the filesystem.
    fileSystem.connections.allowDefaultPortFrom(service);

    // Create ALB
    const lb = new elbv2.ApplicationLoadBalancer(this, 'LB', {
      vpc,
      internetFacing: true
    });
    const listener = lb.addListener('PublicListener', { port: 80, open: true });

    // Attach ALB to ECS Service
    listener.addTargets('ECS', {
      port: 80,
      targets: [service.loadBalancerTarget({
        containerName: 'nginx',
        containerPort: 80
      })],
      healthCheck: {
        // For the purpose of this demo app we allow 403 as a healthy status
        // code because the NGINX webserver will initially respond with 403
        // until we put content into the Elastic File System
        healthyHttpCodes: "200,404",
        interval: cdk.Duration.seconds(60),
        path: "/health",
        timeout: cdk.Duration.seconds(5),
      }
    });

    new cdk.CfnOutput(this, 'LoadBalancerDNS', { value: lb.loadBalancerDnsName, });
  }
}

