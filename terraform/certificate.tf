#########################################
# ACM Certificate for ALB (HTTPS)
#########################################

# Request certificate for the subdomain FQDN (e.g. admin.mabelsrescue.com)
# Assumes local.fqdn is already defined as:
# local.fqdn = "${var.subdomain}.${local.root_domain}"
resource "aws_acm_certificate" "alb_cert" {
  domain_name       = local.fqdn
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name        = "pohualizcalli-alb-cert"
    Environment = "prod"
  }
}

# DNS validation records in Route53
# Assumes local.hosted_zone_id points to the main hosted zone (from SSM)
resource "aws_route53_record" "alb_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.alb_cert.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  zone_id = local.hosted_zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

# Tell ACM to use those Route53 records to validate the cert
resource "aws_acm_certificate_validation" "alb_cert" {
  certificate_arn = aws_acm_certificate.alb_cert.arn

  validation_record_fqdns = [
    for record in aws_route53_record.alb_cert_validation :
    record.fqdn
  ]
}

#########################################
# ALB Listeners (HTTP -> HTTPS redirect)
#########################################

# HTTP listener (80) now just redirects to HTTPS (443)
# ⚠️ Replace your existing aws_lb_listener.http with this one.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  depends_on = [
    aws_lb_listener.http
  ]
}

# resource "aws_lb_listener" "http" {
#   load_balancer_arn = aws_lb.this.arn
#   port              = 80
#   protocol          = "HTTP"

#   default_action {
#     type             = "forward"
#     target_group_arn = aws_lb_target_group.this.arn
#   }
# }

# HTTPS listener (443) using ACM certificate
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-2016-08"
  certificate_arn   = aws_acm_certificate.alb_cert.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this.arn
  }

  depends_on = [
    aws_acm_certificate_validation.alb_cert
  ]
}
