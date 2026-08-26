#!/bin/bash
# ============================================================
#  打包发布脚本（老师用，Mac 上运行）
#
#  生成一个干净的学生版压缩包，自动排除：
#    .venv        —— 老师电脑上装好的环境（57MB，换台电脑用不了）
#    .env         —— 含老师的真实 DeepSeek API Key（绝不能发给学生）
#    .DS_Store / __pycache__ / *.pyc —— 垃圾文件
#    node_modules —— 前端依赖（学生用不到）
#    .git / 旧 zip / 本脚本
#
#  用 Python zipfile 打包：会给中文文件名打上 UTF-8 标志，
#  学生用 Windows 自带解压器也不会乱码；同时保留 .command 的可执行权限。
#
#  用法：终端里运行  bash 打包发布.sh
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

# 双击运行时 PATH 可能太精简，先补上常见 python3 路径
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"

OUT_NAME="learn-claude-code"                  # 压缩包内顶层文件夹名（纯英文，最稳）
OUT_FILE="../learn-claude-code-学生版.zip"     # 压缩包文件名（发给学生的）

if [ -f .env ]; then
    echo "⚠️  检测到 .env（含你的真实 API Key），脚本会自动排除，不会发出去。"
    echo ""
fi

rm -f "$OUT_FILE"

python3 - "$OUT_FILE" "$OUT_NAME" <<'PY'
import sys, zipfile, time
from pathlib import Path

out_file = Path(sys.argv[1])
top_name = sys.argv[2]
root = Path.cwd()

EXCLUDE_DIRS = {'.venv', 'node_modules', '.git', '__pycache__',
                '.pytest_cache', '.mypy_cache', '.ipynb_checkpoints'}
EXCLUDE_FILES = {'.DS_Store', '.env', '打包发布.sh'}
EXCLUDE_SUFFIXES = {'.pyc', '.pyo', '.zip'}

count = 0
with zipfile.ZipFile(out_file, 'w', zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(root.rglob('*')):
        rel = path.relative_to(root)
        parts = rel.parts
        if any(p in EXCLUDE_DIRS for p in parts):
            continue
        if path.name in EXCLUDE_FILES or path.suffix in EXCLUDE_SUFFIXES:
            continue
        if path.is_dir():
            continue
        arc = str(Path(top_name) / rel)
        info = zipfile.ZipInfo(arc)
        info.compress_type = zipfile.ZIP_DEFLATED
        st = path.stat()
        info.external_attr = (st.st_mode & 0xFFFF) << 16   # 保留 .command 可执行权限
        info.date_time = time.localtime(st.st_mtime)[:6]
        zf.writestr(info, path.read_bytes())
        count += 1

print(f"✅ 已打包 {count} 个文件")
print(f"   大小：{out_file.stat().st_size / 1024 / 1024:.1f} MB")
PY

echo ""
echo "👉 把 ${OUT_FILE} 发给学生即可。"
echo "   学生解压后，打开文件夹里的「使用说明.txt」，从第 0 步开始。"
echo "   学生电脑会自动重装依赖，并引导他们填自己的 DeepSeek key。"
