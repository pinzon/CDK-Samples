import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'

const app = new cdk.App();

export class SharedStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly cluster: ecs.Cluster;
  public readonly lb: elbv2.ApplicationLoadBalancer;
  public readonly listener: elbv2.ApplicationListener;

  constructor(scope: Construct, id: string, props: cdk.StackProps = {}) {
    super(scope, id, props);

    this.vpc = new ec2.Vpc(this, 'vpc', { maxAzs: 2 });
    this.cluster = new ecs.Cluster(this, 'cluster', { vpc: this.vpc });
    this.lb = new elbv2.ApplicationLoadBalancer(this, 'lb', {
      vpc: this.vpc,
      internetFacing: true
    });
    this.listener = this.lb.addListener('listener', {
      port: 80,
      open: true,
    });

    this.listener.addAction('fixed-action', {
      action: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'text/plain',
        messageBody: 'OK',
      })
    });

    new cdk.CfnOutput(this, 'dns', { value: this.lb.loadBalancerDnsName });
  }
}

interface ServiceProps extends cdk.StackProps {
  cluster: ecs.Cluster;
  listener: elbv2.ApplicationListener;
  diskPath: string;
  webPath: string;
  priority: number;
}

export class LoadBalancerAttachedService extends cdk.Stack {
  public readonly taskDefinition: ecs.TaskDefinition;
  public readonly container: ecs.ContainerDefinition;
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id, props);

    this.taskDefinition = new ecs.FargateTaskDefinition(this, `${id}-task-def`);
    this.container = this.taskDefinition.addContainer('web', {
      image: ecs.ContainerImage.fromAsset(props.diskPath),
      memoryLimitMiB: 256,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `${id}`,
        mode: ecs.AwsLogDriverMode.NON_BLOCKING,
        maxBufferSize: cdk.Size.mebibytes(25),
      }),
    });

    this.container.addPortMappings({
      containerPort: 8080,
      protocol: ecs.Protocol.TCP
    });

    this.service = new ecs.FargateService(this, `${id}-service`, {
      cluster: props.cluster,
      taskDefinition: this.taskDefinition,
    });

    // Attach ALB to ECS Service
    props.listener.addTargets(`${id}-target`, {
      priority: props.priority,
      conditions: [
        elbv2.ListenerCondition.pathPatterns([props.webPath]),
      ],
      port: 80,
      targets: [this.service.loadBalancerTarget({
        containerName: 'web',
        containerPort: 8080
      })],
      healthCheck: {
        interval: cdk.Duration.seconds(10),
        path: "/",
        timeout: cdk.Duration.seconds(5),
      },
      deregistrationDelay: cdk.Duration.seconds(10)
    });
  }
}
