variable "domain" {
  description = "Root domain name"
  type        = string
}

variable "root_username" {
  description = "Root username"
  type        = string
}
variable "root_email" {
  description = "Root email address"
  type        = string
}
variable "root_ssh_pubkey" {
  description = "Root SSH public key"
  type        = string
}
variable "root_ssh_privkey" {
  description = "Root SSH private key"
  type        = string
}
variable "root_etherpad_password" {
  description = "Root Etherpad password"
  type        = string
  sensitive   = true
}

variable "aws_access_key" {
  description = "AWS access key"
  type        = string
  sensitive   = true
}
variable "aws_secret_key" {
  description = "AWS secret key"
  type        = string
  sensitive   = true
}
variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1"
}
variable "aws_image" {
  description = "AWS EC2 instance AMI ID"
  type        = string
  default     = "ami-02dcfe5d1d39baa4e" # Amazon Linux 2023 Arm
}
