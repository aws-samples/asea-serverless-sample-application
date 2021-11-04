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
import * as cdk from "@aws-cdk/core";
import * as cloudfront from "@aws-cdk/aws-cloudfront";
import * as origins from "@aws-cdk/aws-cloudfront-origins";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as waf from "@aws-cdk/aws-wafv2";

import { WebTier } from "./web-tier";
import { ApiTier } from "./api-tier";
import { DbTier } from "./db-tier";
import { LoggingTools } from "./logging-tools";

export interface SEASampleAppStackProps extends cdk.StackProps {
  readonly vpcId: string;
  readonly appSubnetIds: Array<string>;
  readonly appSecurityGroup: string;
  readonly dataSubnetIds: Array<string>;
  readonly dataSecurityGroup: string;
  readonly dbName: string;
  readonly prefix: string;
  readonly staticSiteBuildPath: string;
  readonly apiContainerPath: string;
}

export class SEASampleAppStack extends cdk.Stack {
  constructor(
    scope: cdk.Construct,
    id: string,
    props?: SEASampleAppStackProps
  ) {
    super(scope, id, props);

    const targetVpc = ec2.Vpc.fromLookup(this, "vpc-lookup", {
      vpcId: props.vpcId,
    });

    const loggingTools = new LoggingTools(this, {
      prefix: props.prefix,
    });

    const dbTier = new DbTier(this, {
      vpc: targetVpc,
      dataSubnetIds: props.dataSubnetIds,
      dataSecurityGroup: props.dataSecurityGroup,
      dbName: props.dbName,
      prefix: props.prefix,
    });

    const apiTier = new ApiTier(this, {
      vpc: targetVpc,
      appSubnetIds: props.appSubnetIds,
      appSecurityGroup: props.appSecurityGroup,
      dbSecret: dbTier.secret,
      prefix: props.prefix,
      apiContainerPath: props.apiContainerPath,
      loggingBucket: loggingTools.loggingBucket
    });

    apiTier.addDependencyToService(dbTier.dbCluster);
    loggingTools.configureNLBLogging(this, apiTier.loggingPrefix, "nlb");

    const webTier = new WebTier(this, {
      prefix: props.prefix,
      staticSiteBuildPath: props.staticSiteBuildPath,
      loggingBucket: loggingTools.loggingBucket
    });

    loggingTools.configureS3Logging(this, webTier.loggingPrefix, "s3web");

    const apiEndPointUrlWithoutProtocol = cdk.Fn.select(
      1,
      cdk.Fn.split("://", apiTier.api.url)
    );
    const apiEndPointDomainName = cdk.Fn.select(
      0,
      cdk.Fn.split("/", apiEndPointUrlWithoutProtocol)
    );

    const originApiPolicy = new cloudfront.OriginRequestPolicy(
      this,
      `${props.prefix}api-origin-policy`,
      {
        comment: "API origin policy",
        queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      }
    );

    new cloudfront.Distribution(
      this,
      `${props.prefix}-distribution`,
      {
        defaultBehavior: {
          origin: new origins.S3Origin(webTier.bucket, {
          }),
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED, //Easier for debugging          
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY
        },
        enableLogging: true,
        defaultRootObject: "index.html",
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
        additionalBehaviors: {
          "api/*": {
            origin: new origins.HttpOrigin(apiEndPointDomainName, {
              protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
              originSslProtocols: [cloudfront.OriginSslPolicy.TLS_V1_2],
              originPath: `/${apiTier.api.deploymentStage.stageName}`,
              customHeaders: {
                [apiTier.XOriginHeaderKey]: apiTier.secret
                  .secretValueFromJson("HEADERVALUE")
                  .toString(),
              },
            }),
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: originApiPolicy,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY
          },
        },
        logBucket: loggingTools.loggingBucket,
        logFilePrefix: "cloudfront",
        minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        httpVersion: cloudfront.HttpVersion.HTTP2
      }
    );

    loggingTools.configureCloudFrontLogging(this, "cloudfront", "cloudfront");

   
  }
}
