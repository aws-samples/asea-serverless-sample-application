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
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deployment from "aws-cdk-lib/aws-s3-deployment";

export interface WebTierProps {
  readonly prefix: string;
  readonly staticSiteBuildPath: string;
  readonly loggingBucket: s3.Bucket;
}

export class WebTier {
  readonly bucket: s3.Bucket;
  readonly loggingPrefix: string = "s3web";

  constructor(scope: cdk.Stack, props?: WebTierProps) {
    this.bucket = new s3.Bucket(scope, `${props.prefix}-web-bucket`, {
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      serverAccessLogsBucket: props.loggingBucket,
      serverAccessLogsPrefix: this.loggingPrefix,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    new s3deployment.BucketDeployment(scope, `${props.prefix}-deployment`, {
      sources: [s3deployment.Source.asset(props.staticSiteBuildPath)],
      destinationBucket: this.bucket,
      retainOnDelete: false,
    });
  }
}
