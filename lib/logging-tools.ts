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
import * as glue from "@aws-cdk/aws-glue-alpha";
import * as glueStable from "aws-cdk-lib/aws-glue";
import * as s3 from "aws-cdk-lib/aws-s3";

export interface LoggingProps {
  readonly prefix: string;
}

export class LoggingTools {
  readonly loggingBucket: s3.Bucket;
  readonly glueDatabase: glue.Database;

  constructor(scope: cdk.Stack, props?: LoggingProps) {
    this.loggingBucket = new s3.Bucket(scope, "LoggingBucket", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          id: "three_months_delete",
          enabled: true,
          expiration: cdk.Duration.days(90),
        },
      ],
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    const cfnLoggingBucket = this.loggingBucket.node.defaultChild as s3.CfnBucket;
    cfnLoggingBucket.cfnOptions.metadata["cfn_nag"] = {
        "rules_to_suppress": [
            {"id": "W35"}, //S3 Bucket should have access logging configured. Don't want to do this on the logging bucket
        ]
      }
    

    this.glueDatabase = new glue.Database(scope, `${props.prefix}GlueDB`, {
      databaseName: `${props.prefix}-db`,
    });
  }

  configureS3Logging(scope: cdk.Stack, prefix: string, tableName: string): void {
    const s3_access_logs_table = new glueStable.CfnTable(scope, prefix, {
      catalogId: scope.account,
      databaseName: this.glueDatabase.databaseName,
      tableInput: {
        name: tableName,
        tableType: "EXTERNAL_TABLE",
        parameters: {
          ["EXTERNAL"]: true,
        },
        storageDescriptor: {
          location: this.loggingBucket.s3UrlForObject() + `/${prefix}`,
          compressed: false,
          columns: [
            {
              name: "bucketowner",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "bucket_name",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "requestdatetime",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "remoteip",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "requester",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "requestid",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "operation",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "key",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "request_uri",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "httpstatus",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "errorcode",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "bytessent",
              type: glue.Schema.BIG_INT.inputString,
            },
            {
              name: "objectsize",
              type: glue.Schema.BIG_INT.inputString,
            },
            {
              name: "totaltime",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "turnaroundtime",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "referrer",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "useragent",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "versionid",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "hostid",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "sigv",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "ciphersuite",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "authtype",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "endpoint",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "tlsversion",
              type: glue.Schema.STRING.inputString,
            }
          ],
          inputFormat: glue.InputFormat.TEXT.className,
          outputFormat: glue.OutputFormat.HIVE_IGNORE_KEY_TEXT.className,
          serdeInfo: {
            serializationLibrary:
              glue.SerializationLibrary.REGEXP.className,
            parameters: {              
              "input.regex":  `([^ ]*) ([^ ]*) \\[(.*?)\\] ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) (\"[^\"]*\"|-) (-|[0-9]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) (\"[^\"]*\"|-) ([^ ]*)(?: ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*))?.*$"`

            },
          },
        },
      },
    });
  }

  configureNLBLogging(scope: cdk.Stack, prefix: string, tableName: string): void {
    const nlb_table = new glueStable.CfnTable(scope, prefix, {
      catalogId: scope.account,
      databaseName: this.glueDatabase.databaseName,
      tableInput: {
        name: tableName,
        tableType: "EXTERNAL_TABLE",
        parameters: {
          ["EXTERNAL"]: true,
        },
        storageDescriptor: {
          location: this.loggingBucket.s3UrlForObject() + `/${prefix}/AWSLogs/${scope.account}/elasticloadbalancing/${scope.region}`,
          compressed: false,
          columns: [
            {
              name: "type",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "version",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "time",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "elb",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "listener_id",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "client_ip",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "client_port",
              type: glue.Schema.INTEGER.inputString,
            },
            {
              name: "target_ip",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "target_port",
              type: glue.Schema.INTEGER.inputString,
            },
            {
              name: "tcp_connection_time_ms",
              type: glue.Schema.DOUBLE.inputString,
            },
            {
              name: "tls_handshake_time_ms",
              type: glue.Schema.DOUBLE.inputString,
            },
            {
              name: "received_bytes",
              type: glue.Schema.BIG_INT.inputString,
            },
            {
              name: "sent_bytes",
              type: glue.Schema.BIG_INT.inputString,
            },
            {
              name: "incoming_tls_alert",
              type: glue.Schema.INTEGER.inputString,
            },
            {
              name: "cert_arn",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "certificate_serial",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "tls_cipher_suite",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "tle_protocol_version",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "tls_named_version",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "domain_name",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "alpn_fe_protocol",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "alpn_be_protocol",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "alpn_client_preference_list",
              type: glue.Schema.STRING.inputString,
            }
          ],
          inputFormat: glue.InputFormat.TEXT.className,
          outputFormat: glue.OutputFormat.HIVE_IGNORE_KEY_TEXT.className,
          serdeInfo: {
            serializationLibrary:
              glue.SerializationLibrary.REGEXP.className,
            parameters: {
              "serialization.format": 1,
              "input.regex":  `([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*):([0-9]*) ([^ ]*):([0-9]*) ([-.0-9]*) ([-.0-9]*) ([-0-9]*) ([-0-9]*) ([-0-9]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*)$"`
                        

            },
          },
        },
      },
    });
  }

  configureCloudFrontLogging(
    scope: cdk.Stack,
    prefix: string,
    tableName: string
  ): void {
    const cloudfront_table = new glueStable.CfnTable(scope, prefix, {
      catalogId: scope.account,
      databaseName: this.glueDatabase.databaseName,
      tableInput: {
        name: tableName,
        tableType: "EXTERNAL_TABLE",
        parameters: {
          ["EXTERNAL"]: true,
        },
        storageDescriptor: {
          location: this.loggingBucket.s3UrlForObject() + `/${prefix}`,
          compressed: false,
          columns: [
            {
              name: "date",
              type: glue.Schema.DATE.inputString,
            },
            {
              name: "time",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "location",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "bytes",
              type: glue.Schema.BIG_INT.inputString,
            },
            {
              name: "request_ip",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "method",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "host",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "uri",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "status",
              type: glue.Schema.INTEGER.inputString,
            },
            {
              name: "referrer",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "user_agent",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "query_string",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "cookie",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "result_type",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "request_id",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "host_header",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "request_protocol",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "request_bytes",
              type: glue.Schema.BIG_INT.inputString,
            },
            {
              name: "time_taken",
              type: glue.Schema.FLOAT.inputString,
            },
            {
              name: "xforwarded_for",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "ssl_protocol",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "ssl_cipher",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "response_result_type",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "http_version",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "fle_status",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "fle_encrypted_fields",
              type: glue.Schema.INTEGER.inputString,
            },
            {
              name: "c_port",
              type: glue.Schema.INTEGER.inputString,
            },
            {
              name: "time_to_first_byte",
              type: glue.Schema.FLOAT.inputString,
            },
            {
              name: "x_edge_detailed_result_type",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "sc_content_type",
              type: glue.Schema.STRING.inputString,
            },
            {
              name: "sc_content_len",
              type: glue.Schema.BIG_INT.inputString,
            },
            {
              name: "sc_range_start",
              type: glue.Schema.BIG_INT.inputString,
            },
            {
              name: "sc_range_end",
              type: glue.Schema.BIG_INT.inputString,
            },
          ],
          inputFormat: glue.InputFormat.TEXT.className,
          outputFormat: glue.OutputFormat.HIVE_IGNORE_KEY_TEXT.className,
          serdeInfo: {
            serializationLibrary:
              glue.SerializationLibrary.LAZY_SIMPLE.className,
            parameters: {
              "serialization.format": "\t",
              "field.delim": "\t",
            },
          },
        },
      },
    });
  }
}
