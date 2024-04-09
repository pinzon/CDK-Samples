#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {SharedStack, LoadBalancerAttachedService} from '../lib/shared-loadbalancer'
import {DurableStorageStack} from "../lib/durable-storage";
import {FargateEcsPatternsStack} from "../lib/ecs-patterns";

const app = new cdk.App();

// Create a stack with multiple ecs patterns that use fargate
const patterns = new FargateEcsPatternsStack(app, 'patterns')

// Create a shared stack with a load balancer
// Stack from https://containersonaws.com/pattern/cdk-shared-alb-for-amazon-ecs-fargate-service
const shared = new SharedStack(app, 'shared-resources');
new LoadBalancerAttachedService(app, 'service-one', {
  cluster: shared.cluster,
  listener: shared.listener,
  diskPath: './service-one',
  webPath: '/service-one*',
  priority: 1
})
new LoadBalancerAttachedService(app, 'service-two', {
  cluster: shared.cluster,
  listener: shared.listener,
  diskPath: './service-two',
  webPath: '/service-two*',
  priority: 2
})

// Create a stack with a durable storage
// Stack from https://containersonaws.com/pattern/elastic-file-system-ecs-cdk
const stack = new DurableStorageStack(app,"durable-stack")
