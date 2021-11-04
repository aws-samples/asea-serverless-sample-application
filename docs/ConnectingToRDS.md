# Connecting To RDS Using Systems Manager Session Manager

## Launch an EC2

1. Launch Amazon Linux 2
![launchec2](../images/ConnectingToRDS_1.png)

1. Pick an EC2 instance size (example: t3.large)
![instancesize](../images/ConnectingToRDS_2.png)

1. Configure necessary settings
![settings](../images/ConnectingToRDS_3.png)

1. Accpet default storage settings
![storage](../images/ConnectingToRDS_4.png)

1. Give the EC2 a name
![ec2name](../images/ConnectingToRDS_5.png)

1. For Security Group, select the existing **App_sg**
![sg](../images/ConnectingToRDS_6.png)

1. Launch the instance AND choose a KeyPair (or create a new one)
![keypair](../images/ConnectingToRDS_7.png)

1. Document the InstanceId (this will be needed later)
![instanceId](../images/ConnectingToRDS_8.png)

## Configure local SSH config

- Reference: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-enable-ssh-connections.html

## MacOS/Linux
On your workstation, add the following to ~/.ssh/config  or if that file doesn’t exist. Create it and paste the following. (This is described in the link above)

```
# SSH over Session Manager
host i-* mi-*
    ProxyCommand sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --parameters 'portNumber=%p'"
```

![sshconfig](../images/ConnectingToRDS_9.png)

If you created a new KeyPair for ec2, you need to change its permissions: 
`chmod 400 KeyPair.pem`

## Get Database Connection Details

1. Navigate to Secrets Manager
1. Click on the Database... Entry
1. Click on **Retrieve Secret Value**

![secret](../images/ConnectingToRDS_10.png)

![secret2](../images/ConnectingToRDS_11.png)

## Establish a Secure Tunnel to the Database

```
ssh -i ~/Desktop/Test.pem -L 5432:demoappstack-demoappdb6fd68cf2-rq7ryqgpgmvx.cluster-cbyxztvfjomp.ca-central-1.rds.amazonaws.com:5432 -N ec2-user@i-06c01ce5afbb3e030
```

![db1](../images/ConnectingToRDS_12.png)

(There won’t be any further output; the connection is established)

## Connect to the Database

1. Create new DB Connection
![db2](../images/ConnectingToRDS_13.png)
1. Specify **localhost** as the database hostname
![db3](../images/ConnectingToRDS_14.png)
1. Specify the database username as defined in the Secret
![db4](../images/ConnectingToRDS_15.png)
1. Enter the password for the database user as defined in the Secret
![db5](../images/ConnectingToRDS_16.png)
1. Enter the database port
![db6](../images/ConnectingToRDS_17.png)
1. Choose **Standard Connection**
![db7](../images/ConnectingToRDS_18.png)
1. Choose **Show All Databases**
![db8](../images/ConnectingToRDS_19.png)
1. Give a name to the database connection string
![db9](../images/ConnectingToRDS_20.png)
1. Explore the database
![db10](../images/ConnectingToRDS_21.png)