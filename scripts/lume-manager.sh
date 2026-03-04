#!/bin/bash
# Lume VM Manager Script
# 管理 ubuntu-vm 的便捷命令

set -euo pipefail

VM_NAME="ubuntu-vm"
SSH_USER="ubuntu"
SSH_HOST="192.168.64.2"
SSH_KEY="${HOME}/.ssh/lume_vm"
LUME_BIN="${HOME}/.local/bin/lume"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取 VM IP（动态）
get_vm_ip() {
    ${LUME_BIN} get ${VM_NAME} --format json 2>/dev/null | grep -o '"ipAddress":"[^"]*"' | cut -d'"' -f4
}

# 检查 VM 状态
check_status() {
    local status=$(${LUME_BIN} ls --format json 2>/dev/null | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "$status"
}

# 显示帮助
show_help() {
    cat << 'EOF'
Lume VM Manager - 管理 ubuntu-vm

用法: ./lume-manager.sh <命令>

命令:
    status      显示 VM 当前状态
    start       启动 VM（通过 launchd）
    stop        停止 VM
    restart     重启 VM
    ssh         SSH 连接到 VM
    ssh-cmd     在 VM 内执行命令（需要加引号）
    ip          获取 VM 当前 IP 地址
    vnc         获取 VNC 连接地址
    logs        查看 VM 运行日志
    daemon-logs 查看 launchd 守护进程日志
    setup-ssh   配置 SSH 免密登录

示例:
    ./lume-manager.sh status
    ./lume-manager.sh ssh
    ./lume-manager.sh ssh-cmd "ls -la /workspace"
    ./lume-manager.sh ssh-cmd "sudo apt-get update"

EOF
}

# 主逻辑
case "${1:-help}" in
    status)
        log_info "查询 ${VM_NAME} 状态..."
        local status=$(check_status)
        local ip=$(get_vm_ip || echo "N/A")

        if [ "$status" = "running" ]; then
            log_success "VM 状态: $status"
            log_info "IP 地址: $ip"
            log_info "SSH 命令: ssh ${SSH_USER}@${ip}"

            # 显示详细信息
            echo ""
            ${LUME_BIN} get ${VM_NAME} 2>/dev/null || true
        else
            log_warn "VM 状态: $status"
            log_info "启动命令: ./lume-manager.sh start"
        fi
        ;;

    start)
        log_info "启动 ${VM_NAME}..."
        if [ "$(check_status)" = "running" ]; then
            log_success "VM 已经在运行"
        else
            launchctl start com.lume.vm.ubuntu
            sleep 2
            if [ "$(check_status)" = "running" ]; then
                log_success "VM 启动成功"
                log_info "IP: $(get_vm_ip)"
            else
                log_error "VM 启动失败，查看日志: ./lume-manager.sh daemon-logs"
            fi
        fi
        ;;

    stop)
        log_info "停止 ${VM_NAME}..."
        launchctl stop com.lume.vm.ubuntu
        ${LUME_BIN} stop ${VM_NAME} 2>/dev/null || true
        log_success "VM 已停止"
        ;;

    restart)
        log_info "重启 ${VM_NAME}..."
        launchctl stop com.lume.vm.ubuntu 2>/dev/null || true
        ${LUME_BIN} stop ${VM_NAME} 2>/dev/null || true
        sleep 2
        launchctl start com.lume.vm.ubuntu
        sleep 3
        if [ "$(check_status)" = "running" ]; then
            log_success "VM 重启成功"
        else
            log_error "VM 重启失败"
        fi
        ;;

    ssh)
        ip=$(get_vm_ip)
        log_info "连接到 ${SSH_USER}@${ip}..."
        log_info "密码: ubuntu（或你自己设置的密码）"
        echo ""
        ssh ${SSH_USER}@${ip}
        ;;

    ssh-cmd)
        if [ -z "${2:-}" ]; then
            log_error "请提供要执行的命令"
            echo "用法: ./lume-manager.sh ssh-cmd '命令'"
            exit 1
        fi
        ip=$(get_vm_ip)
        ssh ${SSH_USER}@${ip} "$2"
        ;;

    ip)
        ip=$(get_vm_ip)
        if [ -n "$ip" ]; then
            echo "$ip"
        else
            log_error "无法获取 IP，VM 可能未运行"
            exit 1
        fi
        ;;

    vnc)
        log_info "VNC 连接信息:"
        ${LUME_BIN} get ${VM_NAME} 2>/dev/null | grep -i vnc || true
        ;;

    logs)
        log_info "VM 运行日志:"
        tail -50 /tmp/lume-vm-ubuntu.log 2>/dev/null || log_warn "无日志文件"
        echo ""
        log_info "错误日志:"
        tail -20 /tmp/lume-vm-ubuntu.error.log 2>/dev/null || log_warn "无错误日志"
        ;;

    daemon-logs)
        log_info "Launchd 守护进程日志:"
        echo "--- 标准输出 ---"
        tail -50 /tmp/lume_daemon.log 2>/dev/null || log_warn "无标准输出日志"
        echo ""
        echo "--- 错误输出 ---"
        tail -50 /tmp/lume_daemon.error.log 2>/dev/null || log_warn "无错误日志"
        ;;

    setup-ssh)
        log_info "配置 SSH 免密登录..."
        ip=$(get_vm_ip)

        # 生成 SSH key（如果不存在）
        if [ ! -f "${SSH_KEY}" ]; then
            log_info "生成 SSH 密钥..."
            ssh-keygen -t ed25519 -f "${SSH_KEY}" -N "" -C "lume-vm"
        fi

        log_info "复制公钥到 VM..."
        log_info "默认密码是: ubuntu"
        ssh-copy-id -i "${SSH_KEY}.pub" ${SSH_USER}@${ip}

        log_success "SSH 配置完成！"
        log_info "之后可以使用: ssh -i ${SSH_KEY} ${SSH_USER}@${ip}"
        ;;

    help|--help|-h)
        show_help
        ;;

    *)
        log_error "未知命令: $1"
        show_help
        exit 1
        ;;
esac
