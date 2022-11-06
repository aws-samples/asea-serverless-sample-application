/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import * as cdk from "aws-cdk-lib";
import { IDependable } from 'constructs';
import * as iam from "aws-cdk-lib/aws-iam";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as waf from "aws-cdk-lib/aws-wafv2";
import * as ecr_assets from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as path from "path";



export interface ApiTierProps {
  readonly vpc: ec2.IVpc;
  readonly appSubnetIds: Array<string>;
  readonly appSecurityGroup: string;
  readonly dbSecret: secrets.Secret;
  readonly prefix: string;
  readonly apiContainerPath: string;
  readonly loggingBucket: s3.Bucket;
}

export class ApiTier {
  readonly api: apigateway.LambdaRestApi;
  readonly secret: secrets.Secret;
  readonly XOriginHeaderKey: string = "X-Origin-Identity";
  readonly APIStageName: string = "prod";
  readonly servicePort: number = 5000;
  readonly fargateService: ecs.FargateService;
  readonly loggingPrefix: string = "nlb";

  constructor(scope: cdk.Stack, props?: ApiTierProps) {
    // Create an ECS cluster
    const cluster = new ecs.Cluster(scope, `${props.prefix}Cluster`, {
      vpc: props.vpc,
      containerInsights: true
    });

    //ECS Task
    const asset = new ecr_assets.DockerImageAsset(
      scope,
      `${props.prefix}APIBuildImage`,
      {
        directory: path.join(__dirname, props.apiContainerPath),
      }
    );

    const taskRole = new iam.Role(
      scope,
      `${props.prefix}APITaskExecutionRole`,
      {
        assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      }
    );

    const logDriver = new ecs.AwsLogDriver({
      streamPrefix: `${props.prefix}`,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(scope, "ApiTaskDef", {
      cpu: 2048,
      memoryLimitMiB: 4096,
      taskRole: taskRole,
    });

    taskDefinition.addContainer(`${props.prefix}API`, {
      image: ecs.ContainerImage.fromDockerImageAsset(asset),
      logging: logDriver,
      environment: {},
      secrets: {
        ["POSTGRESQL_PASSWORD"]: ecs.Secret.fromSecretsManager(
          props.dbSecret,
          "password"
        ),
        ["POSTGRESQL_SERVER"]: ecs.Secret.fromSecretsManager(
          props.dbSecret,
          "host"
        ),
        ["POSTGRESQL_SERVER_PORT"]: ecs.Secret.fromSecretsManager(
          props.dbSecret,
          "port"
        ),
        ["POSTGRESQL_DATABASE"]: ecs.Secret.fromSecretsManager(
          props.dbSecret,
          "dbname"
        ),
        ["POSTGRESQL_USER"]: ecs.Secret.fromSecretsManager(
          props.dbSecret,
          "username"
        ),
      },
      portMappings: [
        {
          containerPort: this.servicePort,
          protocol: ecs.Protocol.TCP,
        },
      ],
    });

    const serviceSecurityGroup = new ec2.SecurityGroup(
      scope,
      `${props.prefix}TaskSecurityGroup`,
      {
        vpc: props.vpc,
      }
    );

    for (const subnetId of props.appSubnetIds) {        
        const subnetCidr = this.getSubnetIPv4FromContext(scope, subnetId);
      
        serviceSecurityGroup.addIngressRule(
          ec2.Peer.ipv4(subnetCidr),
          ec2.Port.tcp(this.servicePort),
          `${props.prefix} API Listener`
        );
    }

    this.fargateService = new ecs.FargateService(
      scope,
      `${props.prefix}APIService`,
      {
        cluster: cluster,
        taskDefinition: taskDefinition,
        vpcSubnets: {
          subnetFilters: [ec2.SubnetFilter.byIds(props.appSubnetIds)],
        },
        desiredCount: 2,
        propagateTags: ecs.PropagatedTagSource.SERVICE,
        enableECSManagedTags: true,
        platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
        securityGroups: [
          ec2.SecurityGroup.fromSecurityGroupId(
            scope,
            "AppSecurityGroup",
            props.appSecurityGroup
          ),
          serviceSecurityGroup,
        ],
      }
    );

    const loadbalancer = new elbv2.NetworkLoadBalancer(
      scope,
      `${props.prefix}NLB`,
      {
        vpc: props.vpc,
        vpcSubnets: {
          subnetFilters: [ec2.SubnetFilter.byIds(props.appSubnetIds)],
        },
        internetFacing: false,
        crossZoneEnabled: true,
      }
    );

    loadbalancer.logAccessLogs(props.loggingBucket, this.loggingPrefix)

    const listener = new elbv2.NetworkListener(
      scope,
      `${props.prefix}NLBListener`,
      {
        port: this.servicePort,
        loadBalancer: loadbalancer,        
      }
    );

    const serviceTarget = listener.addTargets(
      `${props.prefix}APIServiceTarget`,
      {
        port: this.servicePort,
        protocol: elbv2.Protocol.TCP,
        deregistrationDelay: cdk.Duration.seconds(20),
        targets: [this.fargateService],
      }
    );

    const link = new apigateway.VpcLink(scope, `${props.prefix}Link`, {
      targets: [loadbalancer],
    });

    this.api = new apigateway.RestApi(scope, "ApiGateway", {
      restApiName: `${props.prefix}-api`,
      endpointConfiguration: {
        types: [apigateway.EndpointType.REGIONAL],
      },
      cloudWatchRole: true,
      deployOptions: {
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        tracingEnabled: true,
        stageName: this.APIStageName,
      },
    });
    
    this.api.root.addProxy({
      defaultIntegration: new apigateway.Integration({
        type: apigateway.IntegrationType.HTTP_PROXY,
        options: {
          connectionType: apigateway.ConnectionType.VPC_LINK,
          vpcLink: link,
          requestParameters: {
            "integration.request.path.proxy": "method.request.path.proxy"
          }
        },
        integrationHttpMethod: "ANY",
        uri:
          "http://" +
          loadbalancer.loadBalancerDnsName +
          ":" +
          this.servicePort +
          "/{proxy}",       
      }),
      anyMethod: true,
      defaultMethodOptions: {
        requestParameters: {
          "method.request.path.proxy": true
        }
      }
    });

    this.secret = new secrets.Secret(scope, `${props.prefix}WAFSecret`, {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ HEADERVALUE: "RandomPassword" }),
        generateStringKey: "HEADERVALUE",
        excludePunctuation: true,
      },
    });

    const firewall = new waf.CfnWebACL(scope, `${props.prefix}WAF`, {
      defaultAction: {
        block: {},
      },
      scope: "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        sampledRequestsEnabled: true,
        metricName: `${props.prefix}WAF-Block`,
      },
      rules: [
        {
          name: "OriginCheck",
          action: {
            allow: {},
          },
          priority: 0,
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: `${props.prefix}WAF-Allow`,
          },
          statement: {
            orStatement: {
              statements: [
                {
                  byteMatchStatement: {
                    fieldToMatch: {
                      singleHeader: {
                        Name: this.XOriginHeaderKey,
                      },
                    },
                    positionalConstraint: "EXACTLY",
                    searchString: this.secret
                      .secretValueFromJson("HEADERVALUE")
                      .toString(),
                    textTransformations: [
                      {
                        priority: 0,
                        type: "NONE",
                      },
                    ],
                  },
                },
                {
                  byteMatchStatement: {
                    fieldToMatch: {
                      singleHeader: {
                        Name: this.XOriginHeaderKey,
                      },
                    },
                    positionalConstraint: "EXACTLY",
                    searchString: this.secret
                      .secretValueFromJson("HEADERVALUE")
                      .toString(),
                    textTransformations: [
                      {
                        priority: 0,
                        type: "NONE",
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      ],
    });

    const wafAssociation = new waf.CfnWebACLAssociation(
      scope,
      `${props.prefix}WAFAssociation`,
      {
        webAclArn: firewall.attrArn,
        resourceArn: `arn:aws:apigateway:${scope.region}::/restapis/${this.api.restApiId}/stages/${this.APIStageName}`,
      }
    );

    wafAssociation.node.addDependency(firewall);
    wafAssociation.node.addDependency(this.api);
  }

  addDependencyToService(node:IDependable) {
      this.fargateService.node.addDependency(node);
  }

  getSubnetIPv4FromContext(scope: cdk.Stack, subnetId: string) : string {
    const ctx = JSON.parse(process.env.CDK_CONTEXT_JSON);
    
    for (let key of Object.keys(ctx)) {      
      if (Object.prototype.hasOwnProperty.call(ctx[key], "subnetGroups")) {       
        const subnetGroups = ctx[key]["subnetGroups"];
        for (let subnetGroup of subnetGroups) {            
            for (let subnet of subnetGroup["subnets"]) {            
              if (subnet["subnetId"] == subnetId) {                
                return subnet["cidr"];
              }
            }  
        }
      }
    }
    return null;
  }
}
