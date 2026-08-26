"""demo_pkg.utils 模块：提供常用工具函数。"""


def add(a: int, b: int) -> int:
    """返回两个整数的和。

    Args:
        a: 第一个加数。
        b: 第二个加数。

    Returns:
        a 与 b 之和。
    """
    return a + b


def multiply(a: int, b: int) -> int:
    """返回两个整数的积。

    Args:
        a: 第一个乘数。
        b: 第二个乘数。

    Returns:
        a 与 b 之积。
    """
    return a * b


def reverse_string(text: str) -> str:
    """返回反转后的字符串。

    Args:
        text: 要反转的字符串。

    Returns:
        反转后的字符串。
    """
    return text[::-1]
