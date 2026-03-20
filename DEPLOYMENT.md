# 股票系统部署指南

本文档说明如何在不同环境下部署股票系统。

---

## 📋 目录

1. [本地开发环境（macOS）](#1-本地开发环境 macos)
2. [Linux 服务器（生产环境）](#2-linux-服务器生产环境)
3. [Docker 容器化部署](#3-docker-容器化部署)
4. [环境变量配置](#4-环境变量配置)
5. [故障排查](#5-故障排查)

---

## 1. 本地开发环境（macOS）

### 1.1 前置要求

- Node.js >= 18.x
- Git
- macOS 10.15+

### 1.2 安装步骤

```bash
# 1. 克隆项目
cd /Users/vvc/.openclaw/workspace/stock-system

# 2. 安装依赖
npm install

# 3. 配置环境变量（见第 4 节）
cp .env.example .env
# 编辑 .env 填入飞书配置

# 4. 验证安装
node scripts/daily-monitor.mjs
```

### 1.3 配置定时任务（crontab）

**A 股交易时间**：周一至周五 9:30-11:30, 13:00-15:00（北京时间）

**监控执行时间**：每个交易日 15:30（收盘后 30 分钟）

```bash
# 1. 编辑 crontab
crontab -e

# 2. 添加任务（北京时间 15:30，周一到周五）
30 15 * * 1-5 cd /Users/vvc/.openclaw/workspace/stock-system && node scripts/daily-monitor.mjs >> logs/daily-monitor.log 2>&1

# 3. 验证配置
crontab -l
```

**说明**：
- `30 15 * * 1-5`：周一至周五 15:30 执行
- `cd ...`：切换到项目目录
- `node scripts/daily-monitor.mjs`：执行监控脚本
- `>> logs/daily-monitor.log 2>&1`：输出到日志文件（包含错误）

### 1.4 手动测试

```bash
# 立即执行一次监控
cd /Users/vvc/.openclaw/workspace/stock-system
node scripts/daily-monitor.mjs

# 查看日志
tail -f logs/daily-monitor.log
```

---

## 2. Linux 服务器（生产环境）

### 2.1 方案选择

| 方案 | 适用场景 | 推荐度 |
|------|----------|--------|
| crontab | 简单 VPS/云服务器 | ⭐⭐⭐⭐ |
| systemd timer | 现代 Linux (Ubuntu 16+/CentOS 7+) | ⭐⭐⭐⭐⭐ |

### 2.2 方案 A：crontab（简单通用）

```bash
# 1. 确保 Node.js 已安装
node --version  # 建议 >= 18.x

# 2. 克隆项目
git clone <repository-url> /opt/stock-system
cd /opt/stock-system

# 3. 安装依赖
npm install --production

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 填入配置

# 5. 创建日志目录
mkdir -p logs
chmod 755 logs

# 6. 配置 crontab
# 注意：服务器时区可能是 UTC，需要转换
# 北京时间 15:30 = UTC 07:30
crontab -e

# 添加任务（UTC 时间）
30 7 * * 1-5 cd /opt/stock-system && node scripts/daily-monitor.mjs >> logs/daily-monitor.log 2>&1

# 7. 验证
crontab -l
```

### 2.3 方案 B：systemd timer（推荐生产）

**1. 创建 service 文件** `/etc/systemd/system/stock-monitor.service`：

```ini
[Unit]
Description=Stock System Daily Monitor
After=network.target

[Service]
Type=oneshot
User=ubuntu
WorkingDirectory=/home/ubuntu/stock-system
Environment="PATH=/usr/bin:/usr/local/bin"
EnvironmentFile=/home/ubuntu/stock-system/.env
ExecStart=/usr/bin/node scripts/daily-monitor.mjs
StandardOutput=append:/var/log/stock-monitor/out.log
StandardError=append:/var/log/stock-monitor/error.log

[Install]
WantedBy=multi-user.target
```

**2. 创建 timer 文件** `/etc/systemd/system/stock-monitor.timer`：

```ini
[Unit]
Description=Run Stock Monitor Daily at 15:30 CST

[Timer]
# UTC 07:30 = 北京时间 15:30
OnCalendar=*-*-* 07:30:00
Persistent=true

[Install]
WantedBy=timers.target
```

**3. 启用并启动**：

```bash
# 重新加载 systemd
sudo systemctl daemon-reload

# 启用 timer
sudo systemctl enable stock-monitor.timer
sudo systemctl start stock-monitor.timer

# 查看状态
sudo systemctl list-timers
sudo systemctl status stock-monitor.timer

# 查看下次执行时间
systemctl list-timers stock-monitor.timer
```

**4. 查看日志**：

```bash
# 查看服务日志
journalctl -u stock-monitor.service

# 查看实时日志
journalctl -u stock-monitor.service -f
```

---

## 3. Docker 容器化部署

### 3.1 创建 Dockerfile

项目根目录创建 `Dockerfile`：

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# 创建日志目录
RUN mkdir -p logs

# 安装 cron
RUN apk add --no-cache dcron

# 启动脚本
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
```

### 3.2 创建启动脚本

创建 `docker-entrypoint.sh`：

```bash
#!/bin/sh

# 添加 cron 任务（UTC 07:30 = 北京时间 15:30）
echo "30 7 * * 1-5 cd /app && node scripts/daily-monitor.mjs >> logs/daily-monitor.log 2>&1" | crontab -

# 启动 cron 守护进程
crond -f -l 8
```

### 3.3 构建并运行

```bash
# 构建镜像
docker build -t stock-system .

# 运行容器
docker run -d \
  --name stock-monitor \
  --env-file .env \
  -v $(pwd)/logs:/app/logs \
  stock-system

# 查看日志
docker logs -f stock-monitor
```

### 3.4 Docker Compose（推荐）

创建 `docker-compose.yml`：

```yaml
version: '3.8'
services:
  monitor:
    build: .
    container_name: stock-monitor
    env_file: .env
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped
```

启动：

```bash
docker-compose up -d
docker-compose logs -f
```

---

## 4. 环境变量配置

### 4.1 创建 .env 文件

```bash
cp .env.example .env
```

### 4.2 配置说明

```env
# 飞书开放平台配置（必需）
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxx

# 飞书接收者（可选，默认写死在代码中）
# FEISHU_RECEIVE_ID=ou_xxxxxxxxxxxxx

# 日志级别（可选）
LOG_LEVEL=info
```

### 4.3 获取飞书配置

1. 访问 [飞书开放平台](https://open.feishu.cn/)
2. 创建企业自建应用
3. 获取 `App ID` 和 `App Secret`
4. 配置应用权限（需要消息发送权限）

### 4.4 安全建议

```bash
# 限制 .env 文件权限
chmod 600 .env

# 不要将 .env 提交到 Git
# .env 已在 .gitignore 中
```

---

## 5. 故障排查

### 5.1 常见问题

**问题 1：脚本执行失败**

```bash
# 检查 Node.js 版本
node --version  # 需要 >= 18.x

# 检查依赖是否安装
npm install

# 手动执行查看错误
node scripts/daily-monitor.mjs
```

**问题 2：飞书推送失败**

```bash
# 检查环境变量
cat .env

# 测试飞书推送
node scripts/feishu-push.mjs "测试消息"
```

**问题 3：定时任务未执行**

```bash
# 检查 crontab
crontab -l

# 检查 cron 服务状态（Linux）
sudo systemctl status cron

# 查看系统日志（Linux）
grep CRON /var/log/syslog
```

**问题 4：日志文件过大**

配置 logrotate（Linux）：

```bash
# 创建 /etc/logrotate.d/stock-monitor
/var/log/stock-monitor/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 ubuntu ubuntu
}
```

### 5.2 监控告警

建议在服务器上配置监控：

1. **进程监控**：使用 systemd 或 supervisor 确保脚本异常退出后可恢复
2. **日志监控**：配置日志关键字告警（如 "ERROR"、"失败"）
3. **执行监控**：每天检查是否生成了监控报告

---

## 6. 从本地迁移到服务器

### 6.1 数据迁移

```bash
# 1. 备份本地数据
tar -czf stock-data-backup.tar.gz data/ logs/ .env

# 2. 上传到服务器
scp stock-data-backup.tar.gz user@server:/opt/stock-system/

# 3. 服务器解压
cd /opt/stock-system
tar -xzf stock-data-backup.tar.gz
```

### 6.2 时区调整

```bash
# 检查服务器时区
timedatectl  # Linux
date  # macOS

# 如果服务器是 UTC，cron 时间需要调整
# 北京时间 15:30 = UTC 07:30
```

---

## 7. 版本更新

```bash
# 1. 拉取最新代码
cd /opt/stock-system
git pull origin main

# 2. 安装新依赖（如有）
npm install

# 3. 重启服务
# systemd 方式
sudo systemctl restart stock-monitor.timer

# Docker 方式
docker-compose restart

# crontab 方式（自动生效）
```

---

## 📞 支持

如有问题，请查看：
- [TASK_016_MONITOR_GUIDE.md](docs/guides/TASK_016_MONITOR_GUIDE.md) - 监控脚本使用指南
- [TASK_016_STATUS.md](docs/runtime/TASK_016_STATUS.md) - 任务状态文档
