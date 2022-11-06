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
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface DbTierProps {
  readonly vpc: ec2.IVpc;
  readonly dataSubnetIds: Array<string>;
  readonly dataSecurityGroup: string;
  readonly dbName: string;
  readonly prefix: string;
}

export class DbTier {
  readonly secret: secrets.Secret;
  readonly dbUserName: string = "clusteradmin";
  readonly dbCluster: rds.DatabaseCluster;

  constructor(scope: cdk.Stack, props?: DbTierProps) {
    this.secret = new secrets.Secret(scope, "DatabasePassword", {
      generateSecretString: {
        excludePunctuation: true,
        secretStringTemplate: JSON.stringify({
          username: this.dbUserName,
        }),
        generateStringKey: "password",
      },
    });

    const dataSubnetGroup = new rds.SubnetGroup(
      scope,
      `${props.prefix}-data-sbnt-grp`,
      {
        vpc: props.vpc,
        vpcSubnets: {
          subnetFilters: [ec2.SubnetFilter.byIds(props.dataSubnetIds)],
        },
        description: "Data Subnet Group",
      }
    );

    this.dbCluster = new rds.DatabaseCluster(scope, `${props.prefix}-db`, {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_12_9,
      }),
      credentials: rds.Credentials.fromSecret(this.secret), // Optional - will default to 'admin' username and generated password
      instanceProps: {
        // optional , defaults to t3.medium
        instanceType: ec2.InstanceType.of(
          ec2.InstanceClass.BURSTABLE3,
          ec2.InstanceSize.LARGE
        ),
        vpc: props.vpc,
        securityGroups: [
          ec2.SecurityGroup.fromSecurityGroupId(
            scope,
            "DbSecurityGroup",
            props.dataSecurityGroup
          ),
        ],
        enablePerformanceInsights: true,
        publiclyAccessible: false
      },
      
      subnetGroup: dataSubnetGroup,
      defaultDatabaseName: props.dbName,
      storageEncrypted: true,
    });
  }
}
