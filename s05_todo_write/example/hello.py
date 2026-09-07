"""示例模块：问候功能。"""


def greet(name: str) -> str:
    """生成对指定对象的问候语。

    根据传入的名字构建形如 ``Hello, <name>`` 的问候消息。

    Args:
        name: 要问候的对象的名称。

    Returns:
        构造好的问候消息字符串。
    """
    return f"Hello, {name}"


def main() -> None:
    """程序入口：打印默认问候语。"""
    print(greet("Claude"))


if __name__ == "__main__":
    main()
