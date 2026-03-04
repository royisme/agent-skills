#!/bin/bash
# Lume VM Health Check & Auto-Recovery
# 检测 VM 是否冻结并自动重启

set -euo pipefail

VM_NAME="ubuntu-vm"
SSH_USER="ubuntu"
VM_IP="192.168.64.2"
LUME_BIN="${HOME}/.local/bin/lume"
LOG_FILE="/tmp/lume-health-check.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 检查 VM 是否真的可用
check_vm_health() {
    # 检查 IP 是否可达
    if ! ping -c 1 -W 2 "$VM_IP" > /dev/null 2>&1; then
        echo "unhealthy: ping failed"
        return 1
    fi

    # 检查 SSH 端口
    if ! nc -z "$VM_IP" 22 2>/dev/null; then
        echo "unhealthy: ssh port closed"
        return 1
    fi

    echo "healthy"
    return 0
}

# 重启 VM
restart_vm() {
    log "VM 未响应，执行重启..."

    # 停止 VM
    launchctl stop com.lume.vm.ubuntu 2>/dev/null || true
    "$LUME_BIN" stop "$VM_NAME" 2>/dev/null || true

    # 等待完全停止
    sleep 3

    # 强制清理残留进程
    pkill -f "lume run $VM_NAME" 2>/dev/null || true
    sleep 1

    # 重新启动
    launchctl start com.lume.vm.ubuntu

    # 等待启动
    sleep 5

    # 验证
    if check_vm_health > /dev/null; then
        log "VM 重启成功，IP: $VM_IP"
        return 0
    else
        log "VM 重启失败"
        return 1
    fi
}

# 主逻辑
main() {
    log "开始健康检查..."

    health=$(check_vm_health || true)

    if [ "$health" = "healthy" ]; then
        log "VM 健康"
        exit 0
    else
        log "VM 状态异常: $health"
        restart_vm
    fi
}

# 根据参数执行
case "${1:-check}" in
    check)
        main
        ;;
    status)
        check_vm_health
        ;;
    restart)
        restart_vm
        ;;
    *)
        echo "用法: $0 [check|status|restart]"
        exit 1
        ;;
esac
