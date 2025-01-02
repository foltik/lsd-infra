import { Ansible } from "./ansible.ts";
import { AWS } from "./aws.ts";

const getEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`Missing $${name}`);
    Deno.exit(1);
  }
  return value;
};

const AWS_ACCESS_KEY = getEnv("AWS_ACCESS_KEY");
const AWS_SECRET_KEY = getEnv("AWS_SECRET_KEY");
const AWS_REGION = Deno.env.get("AWS_REGION") || "us-east-1";
const AMAZON_LINUX_2023_ARM = "ami-02dcfe5d1d39baa4e";

const DOMAIN = getEnv("DOMAIN");
const ROOT_USERNAME = getEnv("ROOT_USERNAME");
const ROOT_EMAIL = getEnv("ROOT_EMAIL");
const ROOT_PASSWORD = getEnv("ROOT_PASSWORD");
const ROOT_SSH_PUBKEY = getEnv("ROOT_SSH_PUBKEY");

try {
  const aws = new AWS(AWS_REGION, AWS_ACCESS_KEY, AWS_SECRET_KEY);
  const ansible = new Ansible();

  // Setup root keypair and firewall rules
  await aws.createKeyPair("root", ROOT_SSH_PUBKEY);
  const allowSSH = await aws.createSecurityGroup("ssh", [
    { protocol: "tcp", port: 22, description: "SSH" },
  ]);
  const allowWeb = await aws.createSecurityGroup("web", [
    { protocol: "tcp", port: 80, description: "HTTP" },
    { protocol: "tcp", port: 443, description: "HTTPS" },
  ]);

  // Create the `lsd` app.
  // No additional setup needed for now; it's deployed by a github action in the `lsd` repo.
  const lsdIp = await aws.launchInstance({
    name: "lsd",
    type: "t4g.nano",
    image: AMAZON_LINUX_2023_ARM,
    keypair: "root",
    securityGroups: [allowSSH, allowWeb],
  });

  // Create the `drive` app
  const driveIp = await aws.launchInstance({
    name: "drive",
    type: "t4g.micro",
    image: AMAZON_LINUX_2023_ARM,
    keypair: "root",
    securityGroups: [allowSSH, allowWeb],
  });
  await ansible.provision(driveIp, "drive/ansible.yaml", {
    domain: DOMAIN,
    root_username: ROOT_USERNAME,
    root_email: ROOT_EMAIL,
    root_password: ROOT_PASSWORD,
  });

  // Setup DNS
  const zone = await aws.createDnsZone(DOMAIN);
  await aws.createDnsRecord(`beta.${DOMAIN}`, lsdIp, zone);
  await aws.createDnsRecord(`docs.${DOMAIN}`, driveIp, zone);
  await aws.createDnsRecord(`sheets.${DOMAIN}`, driveIp, zone);
} catch (e) {
  console.error(e);
  Deno.exit(1);
}
