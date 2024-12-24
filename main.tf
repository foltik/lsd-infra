provider "aws" {
  region     = var.aws_region
  access_key = var.aws_access_key
  secret_key = var.aws_secret_key
}

resource "aws_key_pair" "root" {
  key_name   = "root"
  public_key = var.root_ssh_pubkey
}
resource "aws_route53_zone" "root" {
  name = var.domain
}


# Drive apps
resource "aws_instance" "drive" {
  ami           = var.aws_image
  instance_type = "t4g.nano"
  key_name      = aws_key_pair.root.key_name
}
resource "null_resource" "wait_for_drive" {
  provisioner "remote-exec" {
    inline = ["echo Waiting for aws_instance.drive to be ready..."]
    connection {
      type        = "ssh"
      user        = "ec2-user"
      private_key = var.root_ssh_privkey
      host        = aws_instance.drive.public_ip
    }
  }
}
resource "null_resource" "drive_ansible" {
  depends_on = [null_resource.wait_for_drive]
  provisioner "local-exec" {
    command = <<-EOF
      ansible-playbook -i ec2-user@${aws_instance.drive.public_ip}, drive/ansible.yaml \
      --extra-vars 'domain="${var.domain}" \
                    root_email="${var.root_email}" \
                    root_etherpad_password="${var.root_etherpad_password}"'
    EOF
  }
}
resource "aws_route53_record" "docs" {
  name    = "docs.${var.domain}"
  zone_id = aws_route53_zone.root.zone_id
  type    = "A"
  ttl     = 300
  records = [aws_instance.drive.public_ip]
}

terraform {
  backend "s3" {
    key            = "state.tfstate"
    bucket         = "lsd-tfstate"
    dynamodb_table = "lsd-tfstate-locks"
    region         = "us-east-1"
    encrypt        = true
  }
}
