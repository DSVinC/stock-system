#!/bin/bash
# 分钟线API测试启动脚本

echo "=========================================="
echo "分钟线API系统测试"
echo "=========================================="

# 检查是否在stock-system目录
if [ ! -f "package.json" ]; then
    echo "错误: 请在stock-system目录下运行此脚本"
    exit 1
fi

# 检查Node.js版本
echo "检查Node.js版本..."
node_version=$(node --version)
echo "Node.js版本: $node_version"

# 检查数据库文件
echo "检查数据库文件..."
if [ ! -f "stock_system.db" ]; then
    echo "警告: 数据库文件不存在，将创建新数据库"
    # 运行迁移
    if [ -f "db/migrations/004_create_stock_minute_table.sql" ]; then
        echo "运行数据库迁移..."
        sqlite3 stock_system.db < db/migrations/004_create_stock_minute_table.sql
        if [ $? -eq 0 ]; then
            echo "数据库迁移成功"
        else
            echo "数据库迁移失败"
            exit 1
        fi
    else
        echo "错误: 数据库迁移文件不存在"
        exit 1
    fi
else
    echo "数据库文件已存在"
fi

# 检查依赖
echo "检查Node.js依赖..."
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "依赖安装失败"
        exit 1
    fi
else
    echo "依赖已安装"
fi

# 启动服务器
echo "启动服务器..."
PORT=3000
HOST=127.0.0.1

# 检查端口是否被占用
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "端口 $PORT 已被占用"
    read -p "是否停止现有进程？ (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "停止端口 $PORT 的进程..."
        kill -9 $(lsof -ti:$PORT) 2>/dev/null
        sleep 2
    else
        echo "请手动释放端口或修改端口号"
        exit 1
    fi
fi

# 启动服务器（后台运行）
echo "启动API服务器..."
nohup node api/server.js > server.log 2>&1 &
SERVER_PID=$!

# 等待服务器启动
echo "等待服务器启动..."
sleep 5

# 检查服务器是否运行
if curl -s http://$HOST:$PORT/api > /dev/null; then
    echo "服务器已成功启动 (PID: $SERVER_PID)"
    echo "API地址: http://$HOST:$PORT"
    echo "日志文件: server.log"
else
    echo "服务器启动失败，查看日志:"
    tail -20 server.log
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo ""
echo "=========================================="
echo "可用测试命令:"
echo "=========================================="
echo "1. 运行完整集成测试:"
echo "   node test-minute-api.js"
echo ""
echo "2. 手动测试API:"
echo "   # 触发数据获取"
echo "   curl -X POST http://localhost:3000/api/minute/fetch \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"ts_code\":\"000001.SZ\",\"start_date\":\"2025-01-01\",\"end_date\":\"2025-01-10\"}'"
echo ""
echo "   # 查询任务状态"
echo "   curl http://localhost:3000/api/minute/status/<task_id>/000001.SZ"
echo ""
echo "   # 查询分钟线数据"
echo "   curl \"http://localhost:3000/api/minute/data?ts_code=000001.SZ&trade_date=20250102&limit=10\""
echo ""
echo "   # 检查数据完整性"
echo "   curl \"http://localhost:3000/api/minute/integrity/000001.SZ?start_date=2025-01-01&end_date=2025-01-10\""
echo ""
echo "   # 获取任务列表"
echo "   curl \"http://localhost:3000/api/minute/tasks?ts_code=000001.SZ&limit=5\""
echo ""
echo "3. 直接运行脚本:"
echo "   # 查看帮助"
echo "   node scripts/fetch_minute_data.mjs help"
echo ""
echo "   # 获取数据"
echo "   node scripts/fetch_minute_data.mjs fetch 000001.SZ 2025-01-01 2025-01-10"
echo ""
echo "   # 检查数据完整性"
echo "   node scripts/fetch_minute_data.mjs integrity 000001.SZ 2025-01-01 2025-01-10"
echo ""
echo "4. 查看数据库:"
echo "   sqlite3 stock_system.db \".tables\""
echo "   sqlite3 stock_system.db \"SELECT * FROM stock_minute LIMIT 5;\""
echo "   sqlite3 stock_system.db \"SELECT * FROM minute_fetch_tasks ORDER BY created_at DESC LIMIT 5;\""
echo ""
echo "5. 停止服务器:"
echo "   kill $SERVER_PID"
echo ""
echo "=========================================="
echo "按Ctrl+C停止服务器并退出"
echo "=========================================="

# 等待用户中断
wait $SERVER_PID