import {
  _InstanceType,
  AuthorizeSecurityGroupIngressCommand,
  CreateSecurityGroupCommand,
  DescribeInstancesCommand,
  DescribeKeyPairsCommand,
  DescribeSecurityGroupsCommand,
  EC2Client,
  ImportKeyPairCommand,
  RunInstancesCommand,
  waitUntilInstanceRunning,
} from "@aws-sdk/client-ec2";

import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  ListHostedZonesByNameCommand,
  Route53Client,
} from "@aws-sdk/client-route-53";

type InstanceConfig = {
  name: string;
  type: string;
  image: string;
  keypair: string;
  securityGroups: string[];
};

type PortConfig = { protocol: string; port: number; description: string };

export class AWS {
  ec2: EC2Client;
  route53: Route53Client;

  constructor(region: string, accessKey: string, secretKey: string) {
    const credentials = { accessKeyId: accessKey, secretAccessKey: secretKey };
    this.ec2 = new EC2Client({ region, credentials });
    this.route53 = new Route53Client({ region, credentials });
  }

  createKeyPair = async (name: string, pubkey: string) => {
    const keypairs = await this.ec2.send(new DescribeKeyPairsCommand());
    if (!keypairs.KeyPairs?.find((k) => k.KeyName == name)) {
      console.log(`Keypair "${name}" not found, creating...`);
      await this.ec2.send(
        new ImportKeyPairCommand({
          KeyName: name,
          PublicKeyMaterial: new TextEncoder().encode(pubkey),
        }),
      );
      console.log(`Keypair "${name}" created`);
    } else {
      console.log(`Keypair "${name}" already exists`);
    }
  };

  createDnsZone = async (domain: string): Promise<string> => {
    const zones = await this.route53.send(
      new ListHostedZonesByNameCommand({ DNSName: domain }),
    );
    const zone = zones.HostedZones?.find((z) => z.Name == `${domain}.`);
    if (zone) {
      console.log(`DNS zone "${domain}" already exists`);
      if (!zones.HostedZones?.[0]?.Id) {
        console.log(zones);
        throw new Error(`Failed to retrieve DNS zone ID for "${domain}`);
      }
      return zones.HostedZones?.[0]?.Id;
    } else {
      console.log(`DNS zone "${domain}" not found, creating...`);
      const result = await this.route53.send(
        new CreateHostedZoneCommand({
          Name: domain,
          CallerReference: Date.now().toString(),
        }),
      );
      if (!result.HostedZone) {
        console.log(result);
        throw new Error(`Failed to create DNS zone "${domain}`);
      }

      if (!result.HostedZone.Id) {
        console.log(result);
        throw new Error(`Failed to retrieve DNS zone ID for "${domain}`);
      }

      console.log(`DNS zone "${domain}" created`);
      return result.HostedZone.Id;
    }
  };

  createDnsRecord = async (name: string, ip: string, zoneId: string) => {
    await this.route53.send(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: zoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                Name: name,
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: ip }],
              },
            },
          ],
        },
      }),
    );
    console.log(`Route53 record "${name}" updated`);
  };

  async createSecurityGroup(
    name: string,
    ports: PortConfig[],
  ): Promise<string> {
    const groups = await this.ec2.send(new DescribeSecurityGroupsCommand());
    const group = groups.SecurityGroups?.find((g) => g.GroupName == name);

    if (group) {
      console.log(`Security group '${name}' already exists`);
      if (!group.GroupId) {
        console.log(group);
        throw new Error(`Failed to retrieve security group ID for ${name}`);
      }
      return group.GroupId;
    } else {
      console.log(`Security group '${name}' not found, creating...`);
      const result = await this.ec2.send(
        new CreateSecurityGroupCommand({
          GroupName: name,
          Description: name,
        }),
      );
      const groupId = result.GroupId!;

      for (const { protocol, port, description } of ports) {
        await this.ec2.send(
          new AuthorizeSecurityGroupIngressCommand({
            GroupId: groupId,
            IpPermissions: [{
              IpProtocol: protocol,
              FromPort: port,
              ToPort: port,
              IpRanges: [{
                CidrIp: "0.0.0.0/0",
                Description: description,
              }],
            }],
          }),
        );
      }

      console.log(
        `Created security group '${name}' with ${ports.length} ports`,
      );
      return groupId;
    }
  }

  launchInstance = async (
    { name, type, image, keypair, securityGroups }: InstanceConfig,
  ): Promise<string> => {
    // first check if the instance already exists
    const desc = await this.ec2.send(new DescribeInstancesCommand());
    const instances = desc.Reservations?.flatMap((r) => r.Instances || []) ||
      [];

    const instance = instances.find((i) =>
      i.Tags?.some((tag) => tag.Key == "Name" && tag.Value == name) &&
      i.State?.Name == "running"
    );
    if (instance) {
      console.log(`Instance '${name}' already running`);
      if (!instance.PublicIpAddress) {
        console.log(instance);
        throw new Error(`Failed to retrieve public IP for instance ${name}`);
      }
      return instance.PublicIpAddress;
    } else {
      console.log(`Instance '${name}' not found, launching...`);
      const result = await this.ec2.send(
        new RunInstancesCommand({
          ImageId: image,
          InstanceType: type as _InstanceType,
          KeyName: keypair,
          SecurityGroupIds: securityGroups,
          MinCount: 1,
          MaxCount: 1,
          TagSpecifications: [{
            ResourceType: "instance",
            Tags: [{ Key: "Name", Value: name }],
          }],
          BlockDeviceMappings: [{
            DeviceName: "/dev/xvda",
            Ebs: { VolumeSize: 8, VolumeType: "gp3", Encrypted: true },
          }],
        }),
      );

      const id = result.Instances?.[0].InstanceId;
      if (!id) {
        console.log(result);
        throw new Error(`Failed to launch instance ${name}`);
      }

      await waitUntilInstanceRunning(
        { client: this.ec2, maxWaitTime: 300 },
        { InstanceIds: [id] },
      );

      // Loop until the instance is running
      const desc = await this.ec2.send(new DescribeInstancesCommand());
      const instances = desc.Reservations?.flatMap((r) => r.Instances || []) ||
        [];
      const instance = instances.find((i) => i.InstanceId == id);
      const ip = instance?.PublicIpAddress;
      if (!ip) {
        console.log(instance);
        throw new Error(`Failed to retrieve public IP for instance ${name}`);
      }

      console.log(`Instance '${name}' launched`);
      return ip;
    }
  };
}
