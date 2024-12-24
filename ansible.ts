export class Ansible {
  constructor() {
  }

  async provision(ip: string, playbook: string, vars: Record<string, string>) {
    console.log(`Playbook ${playbook} executing...`);
    await this.waitForSsh(ip, playbook);

    const command = new Deno.Command("ansible-playbook", {
      args: [
        "-i",
        `ec2-user@${ip},`,
        playbook,
        "--extra-vars",
        Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(" "),
      ],
    });
    const child = command.spawn();
    const status = await child.status;
    if (!status.success) {
      throw new Error(`Failed to execute playbook ${playbook}`);
    } else {
      console.log(`Playbook ${playbook} executed`);
    }
  }

  async waitForSsh(ip: string, playbook: string) {
    console.log(`Playbook ${playbook} waiting for SSH at ${ip}...`);
    const command = new Deno.Command("nc", { args: ["-z", ip, "22"] });
    while (true) {
      const child = command.spawn();
      const status = await child.status;
      if (status.success) {
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
