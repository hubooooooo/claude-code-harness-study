"""示例模块：问候功能。"""


def greet(name: str) -> None:
    """向指定对象打印问候语。

    Args:
        name: 要问候的对象的名称。

    Returns:
        None
    """
    message = f"Hello, {name}"
    print(message)


if __name__ == "__main__":
    greet("Claude")
