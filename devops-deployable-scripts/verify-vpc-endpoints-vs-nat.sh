#!/bin/bash
# =============================================================================
# verify-vpc-endpoints-vs-nat.sh
# =============================================================================
# Verifies whether AWS service traffic is routed through VPC Endpoints or NAT
# Gateway by checking DNS resolution and connectivity.
#
# Usage:
#   ./verify-vpc-endpoints-vs-nat.sh [--region REGION] [--verbose] [--json]
#
# Requirements:
#   - Must be run from an EC2 instance in a private subnet
#   - dig, curl, aws cli (optional for enhanced checks)
#
# Author: Pohualizcalli DevOps
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

REGION="${AWS_REGION:-us-east-1}"
VERBOSE=false
JSON_OUTPUT=false
EXIT_CODE=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# AWS Services to Check
# =============================================================================
# Format: "service_name:endpoint_type:description"
# endpoint_type: interface or gateway

declare -a AWS_SERVICES=(
    # Gateway Endpoints (FREE)
    "s3:gateway:S3 Storage (ECR layers, application buckets)"
    "dynamodb:gateway:DynamoDB (if used)"

    # Interface Endpoints (Required for ECS/Fargate)
    "logs:interface:CloudWatch Logs (container logging)"
    "ecr.api:interface:ECR API (docker login, image management)"
    "ecr.dkr:interface:ECR Docker (docker pull/push)"
    "ecs:interface:ECS Control Plane"
    "ecs-agent:interface:ECS Agent Communication"
    "ecs-telemetry:interface:ECS Telemetry/Metrics"

    # Interface Endpoints (Security & Configuration)
    "secretsmanager:interface:Secrets Manager (credentials)"
    "ssm:interface:SSM Parameter Store"
    "ssmmessages:interface:SSM Session Manager Messages"
    "ec2messages:interface:EC2 Messages (SSM)"
    "kms:interface:KMS (encryption/decryption)"
    "sts:interface:STS (IAM role assumption)"

    # Interface Endpoints (Optional but common)
    "monitoring:interface:CloudWatch Monitoring"
    "events:interface:CloudWatch Events/EventBridge"
    "sns:interface:SNS Notifications"
    "sqs:interface:SQS Queues"
    "lambda:interface:Lambda Invocations"
    "execute-api:interface:API Gateway Private APIs"
    "elasticloadbalancing:interface:ELB API"
    "autoscaling:interface:Auto Scaling API"
    "ec2:interface:EC2 API"
)

# =============================================================================
# Helper Functions
# =============================================================================

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Verify VPC Endpoint routing vs NAT Gateway for AWS services.

OPTIONS:
    -r, --region REGION    AWS region (default: us-east-1 or AWS_REGION env)
    -v, --verbose          Show detailed output including IP addresses
    -j, --json             Output results in JSON format
    -h, --help             Show this help message

EXAMPLES:
    # Basic check
    ./$(basename "$0")

    # Verbose output with specific region
    ./$(basename "$0") --region us-west-2 --verbose

    # JSON output for automation
    ./$(basename "$0") --json

NOTES:
    - Must be run from an EC2 instance in a private subnet
    - Green checkmark (✅) = Using VPC Endpoint
    - Red X (❌) = Using NAT Gateway or no connectivity
    - Yellow warning (⚠️) = Service not required or optional

EOF
    exit 0
}

log_info() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${BLUE}[INFO]${NC} $1" >&2
    fi
}

log_success() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${GREEN}[✅ VPC Endpoint]${NC} $1" >&2
    fi
}

log_warning() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${YELLOW}[⚠️  Warning]${NC} $1" >&2
    fi
}

log_error() {
    if [[ "$JSON_OUTPUT" == false ]]; then
        echo -e "${RED}[❌ NAT/Public]${NC} $1" >&2
    fi
}

# Check if IP is private (RFC 1918)
is_private_ip() {
    local ip="$1"
    if [[ $ip =~ ^10\. ]] || \
       [[ $ip =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]] || \
       [[ $ip =~ ^192\.168\. ]]; then
        return 0
    fi
    return 1
}

# Check if command exists
command_exists() {
    command -v "$1" &> /dev/null
}

# Get DNS resolution for a service
resolve_dns() {
    local fqdn="$1"
    local ip=""

    if command_exists dig; then
        ip=$(dig +short "$fqdn" 2>/dev/null | grep -E '^[0-9]+\.' | head -1)
    elif command_exists nslookup; then
        ip=$(nslookup "$fqdn" 2>/dev/null | grep -A1 "Name:" | grep "Address:" | awk '{print $2}' | head -1)
    elif command_exists host; then
        ip=$(host "$fqdn" 2>/dev/null | grep "has address" | awk '{print $4}' | head -1)
    fi

    echo "$ip"
}

# Test TCP connectivity
test_connectivity() {
    local host="$1"
    local port="${2:-443}"
    local timeout="${3:-5}"

    if command_exists nc; then
        nc -z -w "$timeout" "$host" "$port" &>/dev/null
        return $?
    elif command_exists timeout; then
        timeout "$timeout" bash -c "echo >/dev/tcp/$host/$port" &>/dev/null
        return $?
    else
        # Fallback: try curl
        curl -s --connect-timeout "$timeout" "https://$host" &>/dev/null
        return $?
    fi
}

# Check S3 Gateway endpoint specifically (different method)
# S3 Gateway endpoints:
#   - Do NOT use private DNS (always resolves to public IPs - this is NORMAL)
#   - Work via route table entries pointing to prefix list (pl-xxxxx)
#   - May have endpoint policies restricting which buckets are accessible
check_s3_gateway() {
    local result="unknown"
    local details=""
    local endpoint_id=""
    local route_tables=""
    local policy_restricted="no"

    # S3 Gateway endpoints work via route tables, not DNS
    # DNS will ALWAYS return public IPs for S3 - this is expected behavior

    if command_exists aws; then
        # Get VPC ID from instance metadata
        local token
        local mac
        local vpc_id=""

        token=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
            -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null) || true

        if [[ -n "$token" ]]; then
            mac=$(curl -s -H "X-aws-ec2-metadata-token: $token" \
                http://169.254.169.254/latest/meta-data/mac 2>/dev/null) || true
            if [[ -n "$mac" ]]; then
                vpc_id=$(curl -s -H "X-aws-ec2-metadata-token: $token" \
                    "http://169.254.169.254/latest/meta-data/network/interfaces/macs/${mac}/vpc-id" 2>/dev/null) || true
            fi
        fi

        # Query S3 Gateway endpoints
        local endpoint_info
        if [[ -n "$vpc_id" ]]; then
            endpoint_info=$(aws ec2 describe-vpc-endpoints \
                --filters "Name=service-name,Values=com.amazonaws.${REGION}.s3" \
                          "Name=vpc-endpoint-type,Values=Gateway" \
                          "Name=vpc-id,Values=${vpc_id}" \
                --query 'VpcEndpoints[0].[VpcEndpointId,State,RouteTableIds,PolicyDocument]' \
                --output text --region "$REGION" 2>/dev/null) || true
        else
            # Fallback: query without VPC filter
            endpoint_info=$(aws ec2 describe-vpc-endpoints \
                --filters "Name=service-name,Values=com.amazonaws.${REGION}.s3" \
                          "Name=vpc-endpoint-type,Values=Gateway" \
                --query 'VpcEndpoints[0].[VpcEndpointId,State,RouteTableIds,PolicyDocument]' \
                --output text --region "$REGION" 2>/dev/null) || true
        fi

        if [[ -n "$endpoint_info" && "$endpoint_info" != "None" ]]; then
            endpoint_id=$(echo "$endpoint_info" | awk '{print $1}')
            local state=$(echo "$endpoint_info" | awk '{print $2}')

            if [[ "$state" == "available" ]]; then
                result="vpc_endpoint"

                # Check route table association
                local rt_count
                rt_count=$(aws ec2 describe-vpc-endpoints \
                    --vpc-endpoint-ids "$endpoint_id" \
                    --query 'VpcEndpoints[0].RouteTableIds | length(@)' \
                    --output text --region "$REGION" 2>/dev/null) || rt_count="0"

                # Check if policy is restrictive (not full access)
                local policy
                policy=$(aws ec2 describe-vpc-endpoints \
                    --vpc-endpoint-ids "$endpoint_id" \
                    --query 'VpcEndpoints[0].PolicyDocument' \
                    --output text --region "$REGION" 2>/dev/null) || true

                if [[ -n "$policy" ]] && ! echo "$policy" | grep -q '"Resource":\s*"\*"'; then
                    policy_restricted="yes"
                fi

                details="Gateway endpoint ${endpoint_id} is available"
                [[ "$rt_count" != "0" ]] && details+=", ${rt_count} route table(s) associated"
                [[ "$policy_restricted" == "yes" ]] && details+=", policy restricts to specific buckets (OK)"
                details+=" [DNS returns public IP - NORMAL for Gateway endpoints]"
            else
                result="nat_or_none"
                details="S3 Gateway endpoint exists but state is: $state"
            fi
        else
            result="nat_or_none"
            details="No S3 Gateway endpoint found in VPC - traffic uses NAT"
        fi
    else
        # AWS CLI not available - try functional test
        result="unknown"
        details="AWS CLI not available. Cannot verify Gateway endpoint (DNS check not applicable for S3)"

        # Attempt functional S3 test if aws cli available elsewhere
        if command_exists aws; then
            if aws s3 ls --region "$REGION" &>/dev/null; then
                result="functional"
                details="S3 access works (could be via Gateway endpoint or NAT)"
            fi
        fi
    fi

    echo "$result|$details"
}

# Check DynamoDB Gateway endpoint (similar to S3)
check_dynamodb_gateway() {
    local result="unknown"
    local details=""

    if command_exists aws; then
        local token
        local mac
        local vpc_id=""

        token=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
            -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null) || true

        if [[ -n "$token" ]]; then
            mac=$(curl -s -H "X-aws-ec2-metadata-token: $token" \
                http://169.254.169.254/latest/meta-data/mac 2>/dev/null) || true
            if [[ -n "$mac" ]]; then
                vpc_id=$(curl -s -H "X-aws-ec2-metadata-token: $token" \
                    "http://169.254.169.254/latest/meta-data/network/interfaces/macs/${mac}/vpc-id" 2>/dev/null) || true
            fi
        fi

        local endpoint_state
        if [[ -n "$vpc_id" ]]; then
            endpoint_state=$(aws ec2 describe-vpc-endpoints \
                --filters "Name=service-name,Values=com.amazonaws.${REGION}.dynamodb" \
                          "Name=vpc-endpoint-type,Values=Gateway" \
                          "Name=vpc-id,Values=${vpc_id}" \
                --query 'VpcEndpoints[0].State' \
                --output text --region "$REGION" 2>/dev/null) || true
        else
            endpoint_state=$(aws ec2 describe-vpc-endpoints \
                --filters "Name=service-name,Values=com.amazonaws.${REGION}.dynamodb" \
                          "Name=vpc-endpoint-type,Values=Gateway" \
                --query 'VpcEndpoints[0].State' \
                --output text --region "$REGION" 2>/dev/null) || true
        fi

        if [[ "$endpoint_state" == "available" ]]; then
            result="vpc_endpoint"
            details="DynamoDB Gateway endpoint available [DNS returns public IP - NORMAL]"
        elif [[ -z "$endpoint_state" || "$endpoint_state" == "None" ]]; then
            result="nat_or_optional"
            details="No DynamoDB Gateway endpoint (optional if not using DynamoDB)"
        else
            result="nat_or_none"
            details="DynamoDB Gateway endpoint state: $endpoint_state"
        fi
    else
        result="unknown"
        details="AWS CLI required for Gateway endpoint check"
    fi

    echo "$result|$details"
}

# =============================================================================
# Main Check Function
# =============================================================================

check_service() {
    local service_info="$1"
    local service_name endpoint_type description

    IFS=':' read -r service_name endpoint_type description <<< "$service_info"

    local fqdn="${service_name}.${REGION}.amazonaws.com"
    local ip=""
    local status="unknown"
    local routing="unknown"
    local connectivity="unknown"

    # Special handling for S3 (Gateway endpoint)
    if [[ "$service_name" == "s3" ]]; then
        local s3_result
        s3_result=$(check_s3_gateway)
        routing=$(echo "$s3_result" | cut -d'|' -f1)
        local s3_details
        s3_details=$(echo "$s3_result" | cut -d'|' -f2)

        if [[ "$routing" == "vpc_endpoint" ]]; then
            status="vpc_endpoint"
            log_success "$description"
            [[ "$VERBOSE" == true ]] && echo "         └─ $s3_details" >&2
        elif [[ "$routing" == "functional" ]]; then
            status="functional"
            log_success "$description (verified working)"
            [[ "$VERBOSE" == true ]] && echo "         └─ $s3_details" >&2
        elif [[ "$routing" == "nat_or_none" ]]; then
            status="nat"
            EXIT_CODE=1
            log_error "$description"
            [[ "$VERBOSE" == true ]] && echo "         └─ $s3_details" >&2
        else
            status="unknown"
            log_warning "$description (could not determine - AWS CLI needed)"
            [[ "$VERBOSE" == true ]] && echo "         └─ $s3_details" >&2
        fi

        echo "$service_name|$endpoint_type|$status|$fqdn|-|$description"
        return
    fi

    # Special handling for DynamoDB (Gateway endpoint)
    if [[ "$service_name" == "dynamodb" ]]; then
        local ddb_result
        ddb_result=$(check_dynamodb_gateway)
        routing=$(echo "$ddb_result" | cut -d'|' -f1)
        local ddb_details
        ddb_details=$(echo "$ddb_result" | cut -d'|' -f2)

        if [[ "$routing" == "vpc_endpoint" ]]; then
            status="vpc_endpoint"
            log_success "$description"
            [[ "$VERBOSE" == true ]] && echo "         └─ $ddb_details" >&2
        elif [[ "$routing" == "nat_or_optional" ]]; then
            status="nat_or_optional"
            log_warning "$description (optional if not using DynamoDB)"
            [[ "$VERBOSE" == true ]] && echo "         └─ $ddb_details" >&2
        else
            status="unknown"
            log_warning "$description (could not determine)"
            [[ "$VERBOSE" == true ]] && echo "         └─ $ddb_details" >&2
        fi

        echo "$service_name|$endpoint_type|$status|$fqdn|-|$description"
        return
    fi

    # Interface Endpoints - Check DNS resolution
    ip=$(resolve_dns "$fqdn")

    if [[ -z "$ip" ]]; then
        status="no_resolution"
        log_warning "$description - DNS resolution failed"
        [[ "$VERBOSE" == true ]] && echo "         └─ FQDN: $fqdn" >&2
        echo "$service_name|$endpoint_type|$status|$fqdn||$description"
        return
    fi

    # Check if IP is private (VPC Endpoint) or public (NAT)
    if is_private_ip "$ip"; then
        status="vpc_endpoint"
        routing="private"
        log_success "$description"
        [[ "$VERBOSE" == true ]] && echo "         └─ $fqdn → $ip (private IP)" >&2
    else
        status="nat"
        routing="public"
        EXIT_CODE=1
        log_error "$description"
        [[ "$VERBOSE" == true ]] && echo "         └─ $fqdn → $ip (public IP - using NAT)" >&2
    fi

    # Test connectivity
    if [[ "$VERBOSE" == true ]]; then
        if test_connectivity "$fqdn" 443 5; then
            connectivity="ok"
            echo "         └─ Connectivity: ✅ Port 443 reachable" >&2
        else
            connectivity="failed"
            echo "         └─ Connectivity: ❌ Port 443 not reachable" >&2
        fi
    fi

    echo "$service_name|$endpoint_type|$status|$fqdn|$ip|$description"
}

# =============================================================================
# JSON Output Function
# =============================================================================

output_json() {
    local results=("$@")
    local json_array="["
    local first=true

    for result in "${results[@]}"; do
        local service_name endpoint_type status fqdn ip description
        IFS='|' read -r service_name endpoint_type status fqdn ip description <<< "$result"

        [[ "$first" == true ]] && first=false || json_array+=","

        json_array+=$(cat << EOF
{
    "service": "$service_name",
    "endpoint_type": "$endpoint_type",
    "status": "$status",
    "fqdn": "$fqdn",
    "resolved_ip": "$ip",
    "description": "$description",
    "using_vpc_endpoint": $([ "$status" == "vpc_endpoint" ] && echo "true" || echo "false")
}
EOF
)
    done

    json_array+="]"
    echo "$json_array" | python3 -m json.tool 2>/dev/null || echo "$json_array"
}

# =============================================================================
# Summary Report
# =============================================================================

print_summary() {
    local results=("$@")
    local total=0
    local vpc_endpoint_count=0
    local nat_count=0
    local unknown_count=0
    local optional_count=0

    for result in "${results[@]}"; do
        local status
        status=$(echo "$result" | cut -d'|' -f3)
        ((total++))

        case "$status" in
            vpc_endpoint|functional) ((vpc_endpoint_count++)) ;;
            nat) ((nat_count++)) ;;
            nat_or_optional|no_resolution) ((optional_count++)) ;;
            *) ((unknown_count++)) ;;
        esac
    done

    echo ""
    echo "=============================================="
    echo "                  SUMMARY"
    echo "=============================================="
    echo ""
    printf "  %-25s %d\n" "Total Services Checked:" "$total"
    printf "  ${GREEN}%-25s %d${NC}\n" "✅ Using VPC Endpoint:" "$vpc_endpoint_count"
    printf "  ${RED}%-25s %d${NC}\n" "❌ Using NAT/Public:" "$nat_count"
    printf "  ${YELLOW}%-25s %d${NC}\n" "⚠️  Optional/Unknown:" "$((optional_count + unknown_count))"
    echo ""

    if [[ $nat_count -gt 0 ]]; then
        echo "=============================================="
        echo "         RECOMMENDED ACTIONS"
        echo "=============================================="
        echo ""
        echo "The following services need VPC Endpoints:"
        echo ""
        for result in "${results[@]}"; do
            local service_name status description
            IFS='|' read -r service_name _ status _ _ description <<< "$result"
            if [[ "$status" == "nat" ]]; then
                echo "  • $service_name - $description"
            fi
        done
        echo ""
        echo "Create Interface endpoints in Terraform:"
        echo ""
        for result in "${results[@]}"; do
            local service_name status
            IFS='|' read -r service_name _ status _ _ _ <<< "$result"
            if [[ "$status" == "nat" ]]; then
                cat << EOF
  resource "aws_vpc_endpoint" "${service_name//-/_}" {
    vpc_id              = local.vpc_id
    service_name        = "com.amazonaws.\${var.aws_region}.${service_name}"
    vpc_endpoint_type   = "Interface"
    subnet_ids          = local.endpoint_subnet_ids
    security_group_ids  = [aws_security_group.vpc_endpoints.id]
    private_dns_enabled = true
    tags = { Name = "pohualizcalli-${service_name}-endpoint" }
  }

EOF
            fi
        done
    else
        echo "${GREEN}All required services are using VPC Endpoints!${NC}"
    fi
    echo ""
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

preflight_checks() {
    log_info "Running pre-flight checks..."

    # Check if we have dig or nslookup
    if ! command_exists dig && ! command_exists nslookup && ! command_exists host; then
        echo "ERROR: No DNS lookup tool available (dig, nslookup, or host required)"
        echo "Install with: sudo yum install -y bind-utils"
        exit 1
    fi

    # Check if running on EC2 (optional)
    local instance_id=""
    local token
    token=$(curl -s -X PUT "http://169.254.169.254/latest/api/token" \
        -H "X-aws-ec2-metadata-token-ttl-seconds: 21600" 2>/dev/null || true)

    if [[ -n "$token" ]]; then
        instance_id=$(curl -s -H "X-aws-ec2-metadata-token: $token" \
            http://169.254.169.254/latest/meta-data/instance-id 2>/dev/null || true)
    fi

    if [[ -z "$instance_id" ]]; then
        log_warning "Not running on EC2 or metadata service unavailable"
        log_warning "Results may not reflect actual VPC routing"
    else
        log_info "Running on EC2 instance: $instance_id"
    fi

    # Detect region from metadata if not set
    if [[ "$REGION" == "us-east-1" ]] && [[ -n "$token" ]]; then
        local az
        az=$(curl -s -H "X-aws-ec2-metadata-token: $token" \
            http://169.254.169.254/latest/meta-data/placement/availability-zone 2>/dev/null || true)
        if [[ -n "$az" ]]; then
            REGION="${az%[a-z]}"
            log_info "Detected region from metadata: $REGION"
        fi
    fi

    log_info "Using AWS Region: $REGION"
    echo ""
}

# =============================================================================
# Parse Arguments
# =============================================================================

while [[ $# -gt 0 ]]; do
    case "$1" in
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -j|--json)
            JSON_OUTPUT=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# =============================================================================
# Main Execution
# =============================================================================

main() {
    local results=()

    if [[ "$JSON_OUTPUT" == false ]]; then
        echo ""
        echo "=============================================="
        echo "    VPC Endpoint vs NAT Gateway Checker"
        echo "=============================================="
        echo ""

        preflight_checks

        echo "Checking AWS service routing..."
        echo ""
        echo "----------------------------------------------"
        echo "Gateway Endpoints (S3, DynamoDB)"
        echo "----------------------------------------------"
        echo "Note: Gateway endpoints use route tables, NOT DNS."
        echo "      DNS always returns public IPs - this is normal."
        echo "      Checking via AWS API for endpoint existence..."
        echo ""
    fi

    # Check Gateway endpoints first
    for service_info in "${AWS_SERVICES[@]}"; do
        local endpoint_type
        endpoint_type=$(echo "$service_info" | cut -d':' -f2)
        if [[ "$endpoint_type" == "gateway" ]]; then
            result=$(check_service "$service_info")
            results+=("$result")
        fi
    done

    if [[ "$JSON_OUTPUT" == false ]]; then
        echo ""
        echo "----------------------------------------------"
        echo "Interface Endpoints (All other services)"
        echo "----------------------------------------------"
        echo "Note: Interface endpoints use private DNS."
        echo "      Private IP = VPC Endpoint, Public IP = NAT"
        echo ""
    fi

    # Check Interface endpoints
    for service_info in "${AWS_SERVICES[@]}"; do
        local endpoint_type
        endpoint_type=$(echo "$service_info" | cut -d':' -f2)
        if [[ "$endpoint_type" == "interface" ]]; then
            result=$(check_service "$service_info")
            results+=("$result")
        fi
    done

    # Output results
    if [[ "$JSON_OUTPUT" == true ]]; then
        output_json "${results[@]}"
    else
        print_summary "${results[@]}"
    fi

    exit $EXIT_CODE
}

main
