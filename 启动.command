#!/bin/bash
# ============================================================
#  learn-claude-code 一键启动（Mac 双击本文件即可运行）
#
#  自动处理：
#    1. 检测可用的 Python 3.9+
#    2. 没有时先尝试 Apple 命令行工具
#    3. 仍没有时自动下载官方 Python 并安装
# ============================================================
cd "$(dirname "$0")" || exit 1

PYTHON_BIN=""
OFFICIAL_PYTHON_VERSION="3.13.15"
PKG_NAME="python-${OFFICIAL_PYTHON_VERSION}-macos11.pkg"
PKG_URL="https://www.python.org/ftp/python/${OFFICIAL_PYTHON_VERSION}/${PKG_NAME}"
PKG_PATH="/tmp/${PKG_NAME}"

# 检查给定 Python 是否 >= 3.9
python_ok() {
    "$1" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' >/dev/null 2>&1
}

# 从高到低找一个可用的 Python 3.9+。
# 同时检查官方 Python 的固定安装位置，避免“装好了但 PATH 没刷新”而找不到。
find_python() {
    local cmd
    for cmd in python3.13 python3.12 python3.11 python3.10 python3.9 python3 python; do
        if command -v "$cmd" >/dev/null 2>&1 && python_ok "$cmd"; then
            echo "$cmd"
            return 0
        fi
    done

    local p
    for p in \
        /Library/Frameworks/Python.framework/Versions/3.13/bin/python3.13 \
        /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 \
        /Library/Frameworks/Python.framework/Versions/3.11/bin/python3.11 \
        /Library/Frameworks/Python.framework/Versions/3.10/bin/python3.10 \
        /Library/Frameworks/Python.framework/Versions/3.9/bin/python3.9 \
        /usr/local/bin/python3.13 \
        /usr/local/bin/python3.12 \
        /usr/local/bin/python3.11 \
        /usr/local/bin/python3.10 \
        /usr/local/bin/python3.9; do
        if [ -x "$p" ] && python_ok "$p"; then
            echo "$p"
            return 0
        fi
    done
    return 1
}

# 最多等待 5 分钟，期间每 5 秒重新检测一次
wait_for_python() {
    local _i
    for _i in $(seq 1 60); do
        PYTHON_BIN="$(find_python)" || PYTHON_BIN=""
        [ -n "$PYTHON_BIN" ] && return 0
        sleep 5
    done
    return 1
}

PYTHON_BIN="$(find_python)" || PYTHON_BIN=""

# 没找到合适的 Python 时，macOS 优先尝试 Apple 命令行工具
if [ -z "$PYTHON_BIN" ] && [ "$(uname)" = "Darwin" ]; then
    echo "✅ 正在自动检查 Python..."
    echo "   未检测到可用的 Python 3.9+，先尝试安装 Apple 命令行工具。"
    echo "   如果屏幕弹出安装窗口，请点“安装”并等待完成。"
    echo ""

    if ! xcode-select -p >/dev/null 2>&1; then
        xcode-select --install >/dev/null 2>&1 || true
        wait_for_python || true
    fi
fi

# 仍没有合适的 Python：自动下载并安装官方 Python。
# 安装器会弹出 macOS 管理员密码框，学生只需输入电脑开机密码。
if [ -z "$PYTHON_BIN" ] && [ "$(uname)" = "Darwin" ]; then
    echo "⚠️  仍未检测到合适的 Python，正在自动下载官方 Python ${OFFICIAL_PYTHON_VERSION}..."
    echo "   下载约 70 MB，请保持联网并稍候。"
    echo ""

    if command -v curl >/dev/null 2>&1; then
        rm -f "$PKG_PATH" "${PKG_PATH}.part"
        if curl -L --fail --retry 3 --retry-delay 2 --connect-timeout 20 \
            -o "${PKG_PATH}.part" "$PKG_URL"; then
            mv "${PKG_PATH}.part" "$PKG_PATH"
        else
            rm -f "${PKG_PATH}.part"
        fi
    fi

    if [ -f "$PKG_PATH" ]; then
        echo "下载完成。正在安装，系统会弹出管理员密码框，请输入电脑开机密码。"
        osascript -e "do shell script \"installer -pkg '$PKG_PATH' -target /\" with administrator privileges" >/dev/null
        rm -f "$PKG_PATH"
    else
        echo "下载失败，可能是网络不稳定。请稍后重新双击本文件再试。"
    fi

    PYTHON_BIN="$(find_python)" || PYTHON_BIN=""
fi

if [ -z "$PYTHON_BIN" ]; then
    echo "❌ 自动安装未完成。"
    echo "   请手动安装 Python 3.9+ 后重新双击本文件："
    echo "   https://www.python.org/downloads/"
    echo ""
    read -r -p "按回车关闭窗口..."
    exit 1
fi

echo "✅ 使用 $("$PYTHON_BIN" --version 2>&1) 启动课程..."
echo ""

# 启动课程（会自动装依赖、引导填 key）
"$PYTHON_BIN" run.py

# 课程退出后防止窗口闪退
echo ""
read -r -p "按回车关闭窗口..."
