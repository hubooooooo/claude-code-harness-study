"""demo_pkg.utils 模块的单元测试。"""

import unittest

from demo_pkg.utils import add, multiply, reverse_string


class TestUtils(unittest.TestCase):
    """测试 demo_pkg.utils 中的各种工具函数。"""

    def test_add(self) -> None:
        """测试 add 函数返回正确的和。"""
        self.assertEqual(add(1, 2), 3)
        self.assertEqual(add(-1, 1), 0)
        self.assertEqual(add(0, 0), 0)

    def test_multiply(self) -> None:
        """测试 multiply 函数返回正确的积。"""
        self.assertEqual(multiply(3, 4), 12)
        self.assertEqual(multiply(-2, 5), -10)
        self.assertEqual(multiply(0, 7), 0)

    def test_reverse_string(self) -> None:
        """测试 reverse_string 函数返回反转后的字符串。"""
        self.assertEqual(reverse_string("abc"), "cba")
        self.assertEqual(reverse_string(""), "")
        self.assertEqual(reverse_string("hello"), "olleh")


if __name__ == "__main__":
    unittest.main()
